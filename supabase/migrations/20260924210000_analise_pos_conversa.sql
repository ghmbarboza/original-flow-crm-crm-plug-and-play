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
