-- Sprint 10B-1b — Produtores de eventos ERP de saída.
--
-- Arquitetura: trigger NÃO chama HTTP. Cada evento habilitado vira uma linha
-- PENDENTE em erp_webhook_logs (a tabela de log dobra como fila) com o payload
-- canônico; a edge function erp-outbound, agendada por cron, entrega com o
-- mapeamento e a auth da org e marca success/failed. Mesmo modelo dos
-- dispatchers de follow-up/campanha: resiliente a ERP fora do ar e sem
-- bloquear a transação de negócio.
--
-- Payload canônico usa chaves "entidade.campo" (deal.title, contact.email...)
-- — é sobre elas que o mapeamento configurável renomeia para o campo do ERP.
--
-- Exception handler em tudo: evento de integração nunca derruba a operação.

CREATE OR REPLACE FUNCTION public.enqueue_erp_event(
  p_org uuid,
  p_event text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config record;
BEGIN
  SELECT is_active, outbound_url, outbound_events
    INTO v_config
    FROM erp_integration_configs
   WHERE org_id = p_org;

  IF NOT FOUND
     OR NOT COALESCE(v_config.is_active, false)
     OR v_config.outbound_url IS NULL
     OR NOT (p_event = ANY (COALESCE(v_config.outbound_events, '{}'))) THEN
    RETURN;
  END IF;

  INSERT INTO erp_webhook_logs (org_id, direction, event_type, payload, status)
  VALUES (p_org, 'outbound', p_event, p_payload, 'pending');
END;
$$;

-- Deal ganho / perdido (UPDATE de status) --------------------------------
CREATE OR REPLACE FUNCTION public.erp_on_deal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_payload jsonb;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'won' THEN
    v_event := 'deal_ganho';
  ELSIF NEW.status = 'lost' THEN
    v_event := 'deal_perdido';
  ELSE
    RETURN NEW;
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'deal.id', d.id,
    'deal.title', d.title,
    'deal.value', d.value,
    'deal.currency', d.currency,
    'deal.close_date', d.close_date,
    'deal.status', d.status,
    'deal.loss_reason', lr.label,
    'contact.name', trim(concat(c.first_name, ' ', COALESCE(c.last_name, ''))),
    'contact.email', c.email,
    'contact.phone', COALESCE(c.phone, c.whatsapp_phone),
    'company.name', co.name,
    'deal.products', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', p.name, 'quantity', dp.quantity, 'total_price', dp.total_price))
      FROM deal_products dp JOIN products p ON p.id = dp.product_id
      WHERE dp.deal_id = d.id
    )
  ))
  INTO v_payload
  FROM deals d
  LEFT JOIN contacts c ON c.id = d.contact_id
  LEFT JOIN companies co ON co.id = d.company_id
  LEFT JOIN loss_reasons lr ON lr.id = d.loss_reason_id
  WHERE d.id = NEW.id;

  PERFORM enqueue_erp_event(NEW.org_id, v_event, v_payload);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_deal_status ON public.deals;
CREATE TRIGGER trg_erp_deal_status
  AFTER UPDATE OF status ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.erp_on_deal_status();

-- Contato criado / atualizado --------------------------------------------
CREATE OR REPLACE FUNCTION public.erp_on_contact_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
BEGIN
  v_event := CASE WHEN TG_OP = 'INSERT' THEN 'novo_contato' ELSE 'contato_atualizado' END;
  -- Updates irrelevantes (score, merge etc.) não interessam ao ERP: só
  -- notifica quando os dados cadastrais mudam.
  IF TG_OP = 'UPDATE'
     AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.phone IS NOT DISTINCT FROM OLD.phone
     AND NEW.whatsapp_phone IS NOT DISTINCT FROM OLD.whatsapp_phone
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  PERFORM enqueue_erp_event(NEW.org_id, v_event, jsonb_strip_nulls(jsonb_build_object(
    'contact.id', NEW.id,
    'contact.name', trim(concat(NEW.first_name, ' ', COALESCE(NEW.last_name, ''))),
    'contact.email', NEW.email,
    'contact.phone', COALESCE(NEW.phone, NEW.whatsapp_phone),
    'contact.status', NEW.status
  )));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_contact_change ON public.contacts;
CREATE TRIGGER trg_erp_contact_change
  AFTER INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.erp_on_contact_change();

-- Nova atividade ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erp_on_activity_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM enqueue_erp_event(NEW.org_id, 'nova_atividade', jsonb_strip_nulls(jsonb_build_object(
    'activity.id', NEW.id,
    'activity.type', NEW.type,
    'activity.title', NEW.title,
    'activity.due_date', NEW.due_date,
    'activity.contact_id', NEW.contact_id,
    'activity.deal_id', NEW.deal_id
  )));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_activity_created ON public.activities;
CREATE TRIGGER trg_erp_activity_created
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.erp_on_activity_created();

-- Entrega: erp-outbound a cada minuto. O corpo é vazio de propósito — a
-- function varre todos os pendentes de todas as orgs com a service role.
SELECT cron.unschedule('erp-outbound-dispatch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'erp-outbound-dispatch');

SELECT cron.schedule(
  'erp-outbound-dispatch',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tvwhiyojgtbuwtuohdes.supabase.co/functions/v1/erp-outbound',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(current_setting('app.settings.erp_cron_secret', true), 'erp-cron')
    ),
    body := '{}'::jsonb
  );
  $$
);
