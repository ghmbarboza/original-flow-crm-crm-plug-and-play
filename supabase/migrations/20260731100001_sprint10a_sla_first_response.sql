-- Sprint 10A-8 (Parte 8) — captura das métricas de SLA por conversa.
--
-- A migration 10A-6 criou sla_configs e as colunas em conversations; esta
-- preenche as colunas nos eventos certos, no banco — a primeira resposta pode
-- vir de agente, da IA ou de automação, e todos passam por
-- conversation_messages. Medir no cliente perderia IA e automações.
--
-- Regras:
--  * first_response_at/minutes: primeira mensagem outbound que não é nota
--    interna. Medido desde created_at da conversa.
--  * sla_breached: liga quando a primeira resposta estourou o limite do SLA
--    ativo para o canal. Nunca desliga sozinho (é log, não estado).
--  * resolved_at: quando a conversa fecha (status = 'closed'). Reabrir limpa,
--    para o tempo de resolução refletir o fechamento definitivo. Fechar além
--    de resolution_hours também marca sla_breached.

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

  SELECT id, org_id, channel, created_at, first_response_at
  INTO v_conv
  FROM public.conversations
  WHERE id = NEW.conversation_id
  FOR UPDATE;

  IF v_conv.id IS NULL OR v_conv.first_response_at IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS on_message_record_first_response ON public.conversation_messages;
CREATE TRIGGER on_message_record_first_response
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.record_first_response();

CREATE OR REPLACE FUNCTION public.record_conversation_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config record;
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    NEW.resolved_at := now();

    SELECT resolution_hours, active_channels, is_active
    INTO v_config
    FROM public.sla_configs
    WHERE org_id = NEW.org_id;

    IF FOUND
       AND COALESCE(v_config.is_active, false)
       AND NEW.channel = ANY (COALESCE(v_config.active_channels, ARRAY['whatsapp']))
       AND now() > NEW.created_at + make_interval(hours => v_config.resolution_hours) THEN
      NEW.sla_breached := true;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'closed' AND OLD.status = 'closed' THEN
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_conversation_status_record_resolution ON public.conversations;
CREATE TRIGGER on_conversation_status_record_resolution
  BEFORE UPDATE OF status ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.record_conversation_resolution();
