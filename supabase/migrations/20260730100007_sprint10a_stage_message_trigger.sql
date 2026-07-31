-- Sprint 10A-3b — Gatilho: deal entra numa etapa => agenda a mensagem da etapa.
--
-- Trigger no banco, não no cliente: o deal muda de etapa pelo kanban, pela
-- lista, por automação e (Parte 9) por webhook de WhatsApp. Um hook no
-- useDeals cobriria só os dois primeiros; o trigger cobre todos.
--
-- Regras:
--  1. Ao trocar de etapa, mensagens PENDENTES agendadas por OUTRA etapa são
--     canceladas — o deal saiu daquele contexto, a mensagem envelheceu.
--  2. Se a etapa nova tem auto_message_template e o deal tem contato, agenda
--     em now() + delay. Se já existe pendente desta mesma etapa para o deal,
--     não duplica (mover para fora e de volta não spamma).
--  3. O template é gravado CRU; as variáveis ({{contact.first_name}}...) são
--     resolvidas na hora do envio pelo dispatcher, com dados frescos.

CREATE OR REPLACE FUNCTION public.schedule_stage_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template TEXT;
  v_delay INTEGER;
BEGIN
  -- Só interessa entrada em etapa: INSERT com etapa, ou UPDATE que trocou a etapa.
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
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_stage_message ON public.deals;
CREATE TRIGGER trg_schedule_stage_message
  AFTER INSERT OR UPDATE OF stage_id ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_stage_message();
