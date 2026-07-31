-- Sprint 10B-5b — Guardas de importação nos triggers de mensagem.
--
-- A importação de histórico insere conversation_messages em massa, e os
-- triggers do 10A reagiriam como se fosse tráfego vivo: mensagens inbound
-- antigas moveriam deals no kanban (move_deal_on_reply) e a "primeira
-- resposta" do histórico sujaria o log de SLA (record_first_response).
-- Conversas com import_id ficam fora dos dois. A captura de NPS já é imune
-- por construção (só reage a conversa com pesquisa pendente).

CREATE OR REPLACE FUNCTION public.record_first_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv     record;
  v_config   record;
  v_minutes  integer;
  v_breached boolean := false;
BEGIN
  IF NEW.direction <> 'outbound' OR COALESCE(NEW.is_internal_note, false) THEN
    RETURN NEW;
  END IF;

  SELECT id, org_id, channel, created_at, first_response_at, import_id
  INTO v_conv
  FROM public.conversations
  WHERE id = NEW.conversation_id
  FOR UPDATE;

  -- Histórico importado não é atendimento vivo: fora do SLA.
  IF v_conv.id IS NULL OR v_conv.first_response_at IS NOT NULL OR v_conv.import_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_minutes := GREATEST(0, floor(extract(epoch FROM (now() - v_conv.created_at)) / 60)::integer);

  SELECT first_response_minutes, active_channels, is_active
  INTO v_config
  FROM public.sla_configs
  WHERE org_id = v_conv.org_id;

  IF FOUND
     AND COALESCE(v_config.is_active, false)
     AND v_conv.channel = ANY (COALESCE(v_config.active_channels, ARRAY['whatsapp']))
     AND v_minutes > v_config.first_response_minutes THEN
    v_breached := true;
  END IF;

  UPDATE public.conversations
  SET first_response_at = now(),
      first_response_minutes = v_minutes,
      sla_breached = sla_breached OR v_breached
  WHERE id = v_conv.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_deal_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv   record;
  v_deal   record;
  v_target record;
BEGIN
  IF NEW.direction <> 'inbound' OR COALESCE(NEW.is_internal_note, false) THEN
    RETURN NEW;
  END IF;

  SELECT id, org_id, contact_id, deal_id, channel, import_id
    INTO v_conv
    FROM conversations
   WHERE id = NEW.conversation_id;

  -- Histórico importado não move kanban.
  IF v_conv.id IS NULL
     OR v_conv.import_id IS NOT NULL
     OR COALESCE(v_conv.channel, 'whatsapp') <> 'whatsapp' THEN
    RETURN NEW;
  END IF;

  IF v_conv.deal_id IS NOT NULL THEN
    SELECT id, stage_id INTO v_deal
      FROM deals
     WHERE id = v_conv.deal_id AND status = 'open';
  END IF;
  IF v_deal.id IS NULL AND v_conv.contact_id IS NOT NULL THEN
    SELECT id, stage_id INTO v_deal
      FROM deals
     WHERE contact_id = v_conv.contact_id AND org_id = v_conv.org_id AND status = 'open'
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  IF v_deal.id IS NULL OR v_deal.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.id, s.win_probability
    INTO v_target
    FROM pipeline_stages s
    JOIN pipeline_stages atual ON atual.id = v_deal.stage_id
   WHERE s.org_id = v_conv.org_id
     AND s.pipeline_id = atual.pipeline_id
     AND s.move_on_reply
     AND s.id <> v_deal.stage_id
     AND (
       s.move_on_reply_from_stage_id = v_deal.stage_id
       OR (s.move_on_reply_from_stage_id IS NULL AND atual."order" < s."order")
     )
   ORDER BY (s.move_on_reply_from_stage_id = v_deal.stage_id) DESC, s."order" ASC
   LIMIT 1;

  IF v_target.id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE deals
     SET stage_id = v_target.id,
         probability = v_target.win_probability,
         updated_at = now()
   WHERE id = v_deal.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
