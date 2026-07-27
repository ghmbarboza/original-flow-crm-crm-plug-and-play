-- =====================================================
-- FlowCRM 2.0 — Sprint 8 / Migration 8D: produtor de pontos e regras padrão
--
-- A 8B deu canal às regras, mas até aqui NADA escrevia em lead_score_history:
-- a tabela existia e o score dos contatos nunca subia sozinho. Esta migration
-- fecha esse buraco.
--
--  - apply_lead_score(): resolve a regra (via pick_lead_scoring_rule, que já
--    trata a precedência canal > global), grava o histórico com o canal e
--    incrementa contacts.lead_score. Ponto único de escrita, para os três
--    webhooks não reimplementarem a mesma coisa três vezes.
--  - seed_default_scoring_rules(): organização nova nasce com regras utilizáveis,
--    seguindo o mesmo padrão de trigger do pipeline default.
-- =====================================================

CREATE OR REPLACE FUNCTION public.apply_lead_score(
  p_org uuid,
  p_contact uuid,
  p_event text,
  p_channel text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points integer;
BEGIN
  IF p_contact IS NULL THEN
    RETURN 0;
  END IF;

  v_points := public.pick_lead_scoring_rule(p_org, p_event, p_channel);

  -- Sem regra ativa para o par evento/canal não há o que pontuar. Silêncio aqui
  -- é o comportamento correto: a org escolheu não pontuar esse evento.
  IF v_points IS NULL OR v_points = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.lead_score_history (org_id, contact_id, points, reason, channel)
  VALUES (
    p_org,
    p_contact,
    v_points,
    COALESCE(p_reason, p_event),
    p_channel
  );

  UPDATE public.contacts
  SET lead_score = COALESCE(lead_score, 0) + v_points,
      updated_at = now()
  WHERE id = p_contact AND org_id = p_org;

  RETURN v_points;
END;
$$;

-- =====================================================
-- Regras padrão da organização.
--
-- Instagram vale mais que WhatsApp por decisão de produto do Sprint 8: lead que
-- chega por social costuma ser mais qualificado. A regra geral de
-- 'message_received' cobre os demais canais.
-- =====================================================
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
    (NEW.id, 'email_clicked',        'Link de email clicado',            5, NULL,        true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_org_created_seed_scoring_rules ON public.organizations;
CREATE TRIGGER on_org_created_seed_scoring_rules
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_scoring_rules();

-- Organizações que já existem também recebem as regras: sem isso, só quem criar
-- conta nova depois daqui teria scoring funcionando.
INSERT INTO public.lead_scoring_rules (org_id, event_type, label, points, channel, is_active)
SELECT o.id, v.event_type, v.label, v.points, v.channel, true
FROM public.organizations o
CROSS JOIN (VALUES
  ('message_received',     'Mensagem recebida',                 5, NULL::text),
  ('message_received',     'Mensagem recebida via Instagram',   8, 'instagram'),
  ('conversation_started', 'Nova conversa iniciada',           10, NULL),
  ('form_submitted',       'Formulário de captura preenchido', 15, NULL),
  ('deal_created',         'Negócio criado',                   20, NULL),
  ('email_opened',         'Email aberto',                      3, NULL),
  ('email_clicked',        'Link de email clicado',             5, NULL)
) AS v(event_type, label, points, channel)
ON CONFLICT DO NOTHING;
