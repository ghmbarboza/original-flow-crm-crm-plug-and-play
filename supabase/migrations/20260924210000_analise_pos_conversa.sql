-- Sprint 12 B12: análise pós-conversa (24/09/2026).
--
-- A IA lê a conversa (na 1ª mensagem do lead e a cada N) e extrai o que sabe do
-- cliente: empresa, cargo, dor, resultado desejado, urgência, orçamento, prazo,
-- interesses, objeções, score e próxima ação. Fica em contacts.client_memory,
-- por campo com status unknown|inferred|confirmed (confirmado nunca é
-- sobrescrito pela IA). Preenche o BANT do negócio aberto quando vazio, pontua
-- o lead e sugere/move a etapa pelos critérios escritos em cada etapa.

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS client_memory JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS ai_trigger_criteria TEXT;
ALTER TABLE public.ai_messaging_config ADD COLUMN IF NOT EXISTS analysis JSONB NOT NULL DEFAULT '{"enabled": true, "every_messages": 5, "min_confidence": 70}'::jsonb;

-- Regra de pontuação para quando a IA qualifica o lead (score da análise >= 70).
CREATE OR REPLACE FUNCTION public.seed_default_scoring_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lead_scoring_rules (org_id, event_type, label, points, channel, is_active) VALUES
    (NEW.id, 'message_received',     'Mensagem recebida',                5, NULL,        true),
    (NEW.id, 'message_received',     'Mensagem recebida via Instagram',  8, 'instagram', true),
    (NEW.id, 'conversation_started', 'Nova conversa iniciada',          10, NULL,        true),
    (NEW.id, 'form_submitted',       'Formulário de captura preenchido',15, NULL,        true),
    (NEW.id, 'deal_created',         'Negócio criado',                  20, NULL,        true),
    (NEW.id, 'email_opened',         'Email aberto',                     3, NULL,        true),
    (NEW.id, 'email_clicked',        'Link de email clicado',            5, NULL,        true),
    (NEW.id, 'ai_qualified',         'IA qualificou o lead na conversa',15, NULL,        true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

INSERT INTO public.lead_scoring_rules (org_id, event_type, label, points, channel, is_active)
SELECT o.id, 'ai_qualified', 'IA qualificou o lead na conversa', 15, NULL, true
  FROM public.organizations o
 WHERE NOT EXISTS (SELECT 1 FROM public.lead_scoring_rules r WHERE r.org_id = o.id AND r.event_type = 'ai_qualified');

-- A equipe confirma um campo da memória sem reescrever o JSON inteiro (a IA pode
-- estar gravando ao mesmo tempo). Roda com os direitos de quem chama: a RLS de
-- contacts decide se pode editar.
CREATE OR REPLACE FUNCTION public.confirmar_campo_memoria(p_contact UUID, p_campo TEXT, p_valor TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_novo JSONB;
  v_valor TEXT := nullif(trim(coalesce(p_valor, '')), '');
BEGIN
  IF p_campo NOT IN ('company', 'role', 'primary_pain', 'desired_outcome', 'urgency', 'budget', 'decision_timeline', 'offering_interest', 'next_best_action') THEN
    RAISE EXCEPTION 'Campo inválido' USING ERRCODE = '22023';
  END IF;
  v_novo := CASE WHEN v_valor IS NULL
    THEN jsonb_build_object('value', NULL, 'status', 'unknown')
    ELSE jsonb_build_object('value', left(v_valor, 200), 'status', 'confirmed', 'source', 'equipe', 'updated_at', now()) END;
  UPDATE public.contacts
     SET client_memory = jsonb_set(
           jsonb_set(coalesce(client_memory, '{}'::jsonb), '{lead_state}', coalesce(client_memory->'lead_state', '{}'::jsonb), true),
           ARRAY['lead_state', p_campo], v_novo, true),
         updated_at = now()
   WHERE id = p_contact
   RETURNING client_memory INTO v_novo;
  IF v_novo IS NULL THEN
    RAISE EXCEPTION 'Contato não encontrado' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_novo;
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_campo_memoria(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_campo_memoria(UUID, TEXT, TEXT) TO authenticated;
