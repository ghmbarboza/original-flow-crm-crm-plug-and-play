-- Sprint 10A-9 (Parte 9) — Gatilho de kanban por resposta no WhatsApp.
--
-- Configuração por etapa: "quando o lead responder via WhatsApp, mover o deal
-- para esta etapa" + de onde ele pode vir (etapa específica, ou NULL = qualquer
-- etapa anterior na ordem do funil).
--
-- Trigger no banco, não nos webhooks: evolution, meta e zernio gravam todos em
-- conversation_messages — um único trigger cobre os três (mesma decisão da
-- 10A-3b). Mover a etapa aqui também dispara trg_schedule_stage_message, então
-- a mensagem automática da etapa de destino sai de graça.
--
-- Exception handler: um erro neste gatilho NUNCA pode derrubar a gravação da
-- mensagem recebida (mesmo padrão dos produtores de notificação).

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS move_on_reply BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS move_on_reply_from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;

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

  SELECT id, org_id, contact_id, deal_id, channel
    INTO v_conv
    FROM conversations
   WHERE id = NEW.conversation_id;

  IF v_conv.id IS NULL OR COALESCE(v_conv.channel, 'whatsapp') <> 'whatsapp' THEN
    RETURN NEW;
  END IF;

  -- Deal alvo: o vinculado à conversa se ainda aberto; senão o aberto mais
  -- recente do contato.
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

  -- Etapa de destino: preferir a que aponta exatamente para a etapa atual do
  -- deal; entre regras "qualquer etapa anterior", a de menor ordem à frente.
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

DROP TRIGGER IF EXISTS trg_move_deal_on_reply ON public.conversation_messages;
CREATE TRIGGER trg_move_deal_on_reply
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.move_deal_on_reply();
