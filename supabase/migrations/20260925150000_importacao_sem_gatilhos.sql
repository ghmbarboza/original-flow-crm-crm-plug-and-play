-- Estresse de volume (25/09/2026): importar 2.000 contatos gerou 2.459 avisos
-- "Novo lead" para os administradores, e o insert de negócio importado agendaria
-- a mensagem automática da etapa (WhatsApp) para cada cliente do CRM antigo.
-- Registro criado ou alterado por uma importação passa a carregar import_id, e
-- os gatilhos de aviso, automação e mensagem de etapa pulam esses casos.
-- Webhooks e ERP continuam recebendo (são integrações, não avisos a pessoas).
-- No fim da importação sai um aviso único com o resumo (importacao_concluida).

ALTER TABLE public.contacts   ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE SET NULL;
ALTER TABLE public.companies  ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE SET NULL;
ALTER TABLE public.deals      ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE SET NULL;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE SET NULL;

-- Verdadeiro quando o INSERT/UPDATE foi feito por uma importação.
CREATE OR REPLACE FUNCTION public.mudanca_de_importacao(p_op TEXT, p_novo UUID, p_antigo UUID)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_novo IS NOT NULL AND (p_op = 'INSERT' OR p_novo IS DISTINCT FROM p_antigo);
$$;

CREATE OR REPLACE FUNCTION public.tg_notify_new_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_name text;
begin
  if new.import_id is not null then return new; end if;
  if not (coalesce(new.source, '') = 'capture_form' or new.status = 'lead') then return new; end if;
  v_name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  if v_name = '' then v_name := coalesce(new.email, 'sem nome'); end if;
  if new.owner_id is not null then
    perform create_notification(new.org_id, new.owner_id, 'novo_lead', 'Novo lead: ' || v_name, null, 'contact', new.id);
  else
    perform notify_org_admins(new.org_id, 'novo_lead', 'Novo lead: ' || v_name, null, 'contact', new.id);
  end if;
  return new;
exception when others then raise warning 'tg_notify_new_lead falhou: %', sqlerrm; return new;
end; $$;

CREATE OR REPLACE FUNCTION public.tg_enqueue_contact_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if new.import_id is not null then return new; end if;
  perform enqueue_automations(new.org_id, 'contact_created', to_jsonb(new));
  return new;
exception when others then raise warning 'tg_enqueue_contact_created falhou: %', sqlerrm; return new;
end; $$;

CREATE OR REPLACE FUNCTION public.tg_notify_contact_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.mudanca_de_importacao(TG_OP, NEW.import_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.import_id END) THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NULL OR NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
  IF auth.uid() = NEW.owner_id THEN RETURN NEW; END IF;
  PERFORM create_notification(NEW.org_id, NEW.owner_id, 'lead_atribuido', 'Lead atribuído a você',
    trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')) || ' agora é seu contato.', 'contact', NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_contact_assigned falhou: %', SQLERRM;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_notify_deal_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.mudanca_de_importacao(TG_OP, NEW.import_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.import_id END) THEN RETURN NEW; END IF;
  IF NEW.owner_id IS NULL OR NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
  IF auth.uid() = NEW.owner_id THEN RETURN NEW; END IF;
  PERFORM create_notification(NEW.org_id, NEW.owner_id, 'negocio_atribuido', 'Negócio atribuído a você',
    'O negócio "' || NEW.title || '" agora é seu.', 'deal', NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_deal_assigned falhou: %', SQLERRM;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if public.mudanca_de_importacao(tg_op, new.import_id, case when tg_op = 'UPDATE' then old.import_id end) then return new; end if;
  if new.type <> 'task' or new.user_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then return new; end if;
  perform create_notification(new.org_id, new.user_id, 'tarefa_atribuida', 'Tarefa atribuída: ' || new.title, null, 'activity', new.id);
  return new;
exception when others then raise warning 'tg_notify_task_assigned falhou: %', sqlerrm; return new;
end; $$;

CREATE OR REPLACE FUNCTION public.schedule_stage_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_template TEXT;
  v_delay INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    UPDATE scheduled_messages
       SET status = 'cancelled'
     WHERE deal_id = NEW.id
       AND status = 'pending'
       AND pipeline_stage_id IS NOT NULL
       AND pipeline_stage_id <> NEW.stage_id;
  END IF;

  -- Negócio vindo de importação não recebe a mensagem automática da etapa:
  -- seriam mensagens para toda a base do CRM antigo de uma vez.
  IF public.mudanca_de_importacao(TG_OP, NEW.import_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.import_id END) THEN
    RETURN NEW;
  END IF;

  SELECT auto_message_template, COALESCE(auto_message_delay_hours, 0)
    INTO v_template, v_delay
    FROM pipeline_stages
   WHERE id = NEW.stage_id;

  IF v_template IS NULL OR btrim(v_template) = '' OR NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM scheduled_messages
     WHERE deal_id = NEW.id AND pipeline_stage_id = NEW.stage_id AND status = 'pending'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO scheduled_messages
    (org_id, contact_id, deal_id, pipeline_stage_id, message, scheduled_at)
  VALUES
    (NEW.org_id, NEW.contact_id, NEW.id, NEW.stage_id, v_template,
     now() + make_interval(hours => v_delay));

  RETURN NEW;
END; $$;

-- Aviso único ao concluir a importação (no lugar de um por registro).
CREATE OR REPLACE FUNCTION public.tg_import_concluida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rotulo TEXT := CASE NEW.kind WHEN 'contacts' THEN 'contatos' WHEN 'companies' THEN 'empresas' WHEN 'deals' THEN 'negócios' ELSE 'atividades' END;
  v_criados INT := COALESCE((NEW.stats->>'created')::int, 0);
  v_atualizados INT := COALESCE((NEW.stats->>'updated')::int, 0);
  v_erros INT := COALESCE((NEW.stats->>'error')::int, 0);
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL THEN RETURN NEW; END IF;
  PERFORM create_notification(NEW.org_id, NEW.created_by, 'importacao_concluida',
    'Importação concluída: ' || v_criados || ' ' || v_rotulo || ' novos',
    v_atualizados || ' atualizados, ' || v_erros || ' com erro.', 'import', NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_import_concluida falhou: %', SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_import_concluida ON public.imports;
CREATE TRIGGER trg_import_concluida AFTER UPDATE OF status ON public.imports
  FOR EACH ROW EXECUTE FUNCTION public.tg_import_concluida();
