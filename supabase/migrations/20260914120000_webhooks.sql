-- Sprint 11, Fase 2: Webhooks de entrada e saída.
--
-- Ponte padrão entre o FlowCRM e as outras soluções do Viver de IA (e n8n, Make,
-- qualquer sistema com HTTP). Contrato documentado em WEBHOOKS.md.
--
-- SAÍDA: cada empresa cadastra quantos destinos quiser, cada um com seus eventos
-- e seu secret. Triggers de banco enfileiram uma entrega por destino inscrito em
-- webhook_deliveries; a function webhook-dispatcher entrega a cada minuto,
-- assina (HMAC-SHA256 de "timestamp.corpo") e tenta de novo com espera crescente
-- (1 min, 5 min, 30 min, 2 h, 12 h). Depois disso a entrega fica "failed" com a
-- resposta do destino, e o admin pode reenviar pela tela.
--
-- ENTRADA: uma chave por solução conectada. A chave inteira só aparece na
-- criação; o banco guarda o hash. A function webhook-inbound aceita ações do
-- CRM (contact.upsert, deal.create...) e os eventos das outras soluções
-- (lead.created, contract.signed, payment.confirmed...). Idempotency-Key evita
-- processar a mesma chamada duas vezes.
--
-- Mesmo padrão da integração ERP: trigger nunca faz HTTP e nunca derruba a
-- operação de negócio (exception handler em tudo). Dado de demonstração não sai.

-- ---------------------------------------------------------------------------
-- Saída
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL CHECK (url ~* '^https?://'),
  events text[] NOT NULL DEFAULT '{}',
  secret text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_endpoints_org_idx ON public.webhook_endpoints (org_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'retrying', 'success', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status_code integer,
  last_response text,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_fila_idx
  ON public.webhook_deliveries (next_attempt_at)
  WHERE status IN ('pending', 'retrying', 'sending');
CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint_idx
  ON public.webhook_deliveries (endpoint_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Entrada
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_inbound_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Início da chave (fcrm_xxxxxxxx), só para o admin reconhecer qual é qual.
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_inbound_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_id uuid REFERENCES public.webhook_inbound_keys(id) ON DELETE SET NULL,
  idempotency_key text,
  action text,
  -- processing: a chamada reservou a Idempotency-Key e ainda está executando.
  status text NOT NULL CHECK (status IN ('processing', 'success', 'failed', 'duplicate')),
  http_status integer NOT NULL,
  request jsonb,
  response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reserva da Idempotency-Key: a linha nasce "processing" antes de executar, então
-- duas chamadas simultâneas com a mesma chave não executam o efeito duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS webhook_inbound_logs_idempotencia
  ON public.webhook_inbound_logs (key_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('processing', 'success');
CREATE INDEX IF NOT EXISTS webhook_inbound_logs_org_idx
  ON public.webhook_inbound_logs (org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: tudo de webhook é área de admin.
-- ---------------------------------------------------------------------------
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_inbound_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_inbound_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_admin ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin ON public.webhook_endpoints FOR ALL
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

-- Entregas são escritas pelos triggers e pela function; o admin lê e apaga.
DROP POLICY IF EXISTS webhook_deliveries_admin_select ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_select ON public.webhook_deliveries FOR SELECT
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS webhook_deliveries_admin_delete ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_delete ON public.webhook_deliveries FOR DELETE
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

-- Chaves: o admin lista, revoga e apaga. Criar é só pela RPC (gera e devolve a
-- chave uma única vez), por isso não há policy de INSERT.
DROP POLICY IF EXISTS webhook_keys_admin_select ON public.webhook_inbound_keys;
CREATE POLICY webhook_keys_admin_select ON public.webhook_inbound_keys FOR SELECT
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS webhook_keys_admin_update ON public.webhook_inbound_keys;
CREATE POLICY webhook_keys_admin_update ON public.webhook_inbound_keys FOR UPDATE
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS webhook_keys_admin_delete ON public.webhook_inbound_keys;
CREATE POLICY webhook_keys_admin_delete ON public.webhook_inbound_keys FOR DELETE
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS webhook_inbound_logs_admin_select ON public.webhook_inbound_logs;
CREATE POLICY webhook_inbound_logs_admin_select ON public.webhook_inbound_logs FOR SELECT
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS webhook_inbound_logs_admin_delete ON public.webhook_inbound_logs;
CREATE POLICY webhook_inbound_logs_admin_delete ON public.webhook_inbound_logs FOR DELETE
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- Chave de entrada: gerada no banco, devolvida uma vez só.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_chave_webhook(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org uuid;
  v_chave text;
  v_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada';
  END IF;
  IF coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Dê um nome para a chave (ex.: a solução que vai usar)';
  END IF;

  v_chave := 'fcrm_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO webhook_inbound_keys (org_id, name, key_prefix, key_hash, created_by)
  VALUES (v_org, trim(p_name), left(v_chave, 13), encode(digest(v_chave, 'sha256'), 'hex'), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'key', v_chave);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_chave_webhook(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_chave_webhook(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Produtores de evento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(p_org uuid, p_event text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid := gen_random_uuid();
BEGIN
  IF p_org IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO webhook_deliveries (org_id, endpoint_id, event_id, event, payload)
  SELECT e.org_id, e.id, v_event_id, p_event,
         jsonb_build_object(
           'id', v_event_id,
           'event', p_event,
           'org_id', p_org,
           'occurred_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'source', 'flowcrm',
           'data', p_data
         )
    FROM webhook_endpoints e
   WHERE e.org_id = p_org
     AND e.is_active
     AND (p_event = ANY (e.events) OR '*' = ANY (e.events));
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_webhook_event(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Blocos de dados reaproveitados pelos eventos.
CREATE OR REPLACE FUNCTION public.webhook_contato_json(p_contact uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', c.id,
    'first_name', c.first_name,
    'last_name', c.last_name,
    'name', trim(concat(c.first_name, ' ', coalesce(c.last_name, ''))),
    'email', c.email,
    'phone', c.phone,
    'whatsapp', c.whatsapp_phone,
    'status', c.status,
    'source', c.source,
    'lead_score', c.lead_score,
    'company', CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object('id', co.id, 'name', co.name) END,
    'custom_fields', c.custom_fields,
    'created_at', c.created_at
  ))
  FROM contacts c LEFT JOIN companies co ON co.id = c.company_id
  WHERE c.id = p_contact;
$$;

CREATE OR REPLACE FUNCTION public.webhook_negocio_json(p_deal uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'value', d.value,
    'currency', d.currency,
    'status', d.status,
    'probability', d.probability,
    'close_date', d.close_date,
    'stage', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id', s.id, 'name', s.name) END,
    'loss_reason', lr.label,
    'created_at', d.created_at
  ))
  FROM deals d
  LEFT JOIN pipeline_stages s ON s.id = d.stage_id
  LEFT JOIN loss_reasons lr ON lr.id = d.loss_reason_id
  WHERE d.id = p_deal;
$$;

REVOKE ALL ON FUNCTION public.webhook_contato_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webhook_negocio_json(uuid) FROM PUBLIC, anon, authenticated;

-- Contatos ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.webhook_on_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.is_demo, false) OR NEW.merged_into_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.phone IS NOT DISTINCT FROM OLD.phone
     AND NEW.whatsapp_phone IS NOT DISTINCT FROM OLD.whatsapp_phone
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.custom_fields IS NOT DISTINCT FROM OLD.custom_fields THEN
    RETURN NEW;
  END IF;

  PERFORM enqueue_webhook_event(
    NEW.org_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'contact.created' ELSE 'contact.updated' END,
    jsonb_build_object('contact', webhook_contato_json(NEW.id))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_contact ON public.contacts;
CREATE TRIGGER trg_webhook_contact
  AFTER INSERT OR UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.webhook_on_contact();

-- Negócios ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.webhook_on_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data jsonb;
BEGIN
  IF coalesce(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'deal', webhook_negocio_json(NEW.id),
    'contact', CASE WHEN NEW.contact_id IS NULL THEN NULL ELSE webhook_contato_json(NEW.contact_id) END
  ));

  IF TG_OP = 'INSERT' THEN
    PERFORM enqueue_webhook_event(NEW.org_id, 'deal.created', v_data);
    RETURN NEW;
  END IF;

  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    PERFORM enqueue_webhook_event(NEW.org_id, 'deal.stage_changed',
      v_data || jsonb_build_object('previous_stage',
        (SELECT jsonb_build_object('id', s.id, 'name', s.name) FROM pipeline_stages s WHERE s.id = OLD.stage_id)));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('won', 'lost') THEN
    PERFORM enqueue_webhook_event(NEW.org_id, CASE WHEN NEW.status = 'won' THEN 'deal.won' ELSE 'deal.lost' END, v_data);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_deal ON public.deals;
CREATE TRIGGER trg_webhook_deal
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.webhook_on_deal();

-- Atividades ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.webhook_on_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;
  PERFORM enqueue_webhook_event(NEW.org_id, 'activity.created', jsonb_strip_nulls(jsonb_build_object(
    'activity', jsonb_strip_nulls(jsonb_build_object(
      'id', NEW.id, 'type', NEW.type, 'title', NEW.title, 'body', NEW.body,
      'due_date', NEW.due_date, 'deal_id', NEW.deal_id, 'created_at', NEW.created_at
    )),
    'contact', CASE WHEN NEW.contact_id IS NULL THEN NULL ELSE webhook_contato_json(NEW.contact_id) END
  )));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_activity ON public.activities;
CREATE TRIGGER trg_webhook_activity
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.webhook_on_activity();

-- Mensagens recebidas -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.webhook_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
BEGIN
  IF NEW.direction <> 'inbound' OR coalesce(NEW.is_demo, false) OR coalesce(NEW.is_internal_note, false) THEN
    RETURN NEW;
  END IF;
  SELECT id, contact_id, channel, provider, phone_number INTO v_conv FROM conversations WHERE id = NEW.conversation_id;

  PERFORM enqueue_webhook_event(NEW.org_id, 'message.received', jsonb_strip_nulls(jsonb_build_object(
    'message', jsonb_strip_nulls(jsonb_build_object(
      'id', NEW.id, 'type', NEW.type, 'content', NEW.content, 'media_url', NEW.media_url, 'created_at', NEW.created_at
    )),
    'conversation', jsonb_build_object(
      'id', v_conv.id, 'channel', coalesce(v_conv.channel, 'whatsapp'), 'provider', v_conv.provider, 'phone', v_conv.phone_number
    ),
    'contact', CASE WHEN v_conv.contact_id IS NULL THEN NULL ELSE webhook_contato_json(v_conv.contact_id) END
  )));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_message ON public.conversation_messages;
CREATE TRIGGER trg_webhook_message
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.webhook_on_message();

-- NPS respondido ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.webhook_on_nps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.is_demo, false) OR NEW.score IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.score IS NOT DISTINCT FROM NEW.score) THEN
    RETURN NEW;
  END IF;
  PERFORM enqueue_webhook_event(NEW.org_id, 'nps.submitted', jsonb_strip_nulls(jsonb_build_object(
    'nps', jsonb_strip_nulls(jsonb_build_object(
      'id', NEW.id, 'score', NEW.score, 'comment', NEW.comment, 'channel', NEW.channel,
      'category', CASE WHEN NEW.score >= 9 THEN 'promoter' WHEN NEW.score >= 7 THEN 'passive' ELSE 'detractor' END,
      'responded_at', NEW.responded_at
    )),
    'contact', CASE WHEN NEW.contact_id IS NULL THEN NULL ELSE webhook_contato_json(NEW.contact_id) END
  )));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_nps ON public.nps_responses;
CREATE TRIGGER trg_webhook_nps
  AFTER INSERT OR UPDATE OF score ON public.nps_responses
  FOR EACH ROW EXECUTE FUNCTION public.webhook_on_nps();

-- ---------------------------------------------------------------------------
-- Agendamento da entrega + disparo manual (usado pelo botão e pelo hard smoke)
-- ---------------------------------------------------------------------------
SELECT public.agendar_dispatcher('webhook-dispatch', '* * * * *', 'webhook-dispatcher');

CREATE OR REPLACE FUNCTION public.executar_dispatcher_agora(p_function text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;
  IF p_function NOT IN (
    'automation-dispatcher', 'erp-outbound', 'followup-dispatcher',
    'nps-dispatcher', 'scheduled-message-dispatcher', 'webhook-dispatcher'
  ) THEN
    RAISE EXCEPTION 'Dispatcher desconhecido: %', p_function;
  END IF;

  RETURN net.http_post(
    url := 'https://tvwhiyojgtbuwtuohdes.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.internal_cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;
