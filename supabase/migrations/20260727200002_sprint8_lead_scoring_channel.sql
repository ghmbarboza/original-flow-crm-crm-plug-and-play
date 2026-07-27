-- =====================================================
-- FlowCRM 2.0 — Sprint 8 / Migration 8B: lead scoring por canal
--
-- Uma mensagem no Instagram pode valer mais que uma no WhatsApp. As regras
-- ganham canal opcional:
--   channel IS NULL  → regra vale para todos os canais (comportamento atual)
--   channel = 'x'    → regra vale só para o canal x
--
-- A regra mais específica vence: havendo regra do canal e regra geral para o
-- mesmo event_type, aplica-se a do canal. Quem resolve isso é a função
-- pick_lead_scoring_rule abaixo, para a lógica não ficar espalhada nos webhooks.
-- =====================================================

ALTER TABLE public.lead_scoring_rules
  ADD COLUMN IF NOT EXISTS channel text DEFAULT NULL;

ALTER TABLE public.lead_scoring_rules DROP CONSTRAINT IF EXISTS lead_scoring_rules_channel_check;
ALTER TABLE public.lead_scoring_rules
  ADD CONSTRAINT lead_scoring_rules_channel_check
  CHECK (channel IS NULL OR channel IN (
    'whatsapp','instagram','facebook','telegram',
    'twitter','youtube','reddit','bluesky','threads'
  ));

-- Contexto do canal no histórico, para o extrato de pontos explicar de onde veio.
ALTER TABLE public.lead_score_history
  ADD COLUMN IF NOT EXISTS channel text DEFAULT NULL;

-- Uma regra por (org, evento, canal). Sem isso, duas regras iguais para o mesmo
-- canal tornariam a pontuação não-determinística.
-- Índice parcial + índice normal porque NULL não colide em UNIQUE comum.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_scoring_rules_event_channel
  ON public.lead_scoring_rules (org_id, event_type, channel)
  WHERE channel IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_scoring_rules_event_global
  ON public.lead_scoring_rules (org_id, event_type)
  WHERE channel IS NULL;

-- =====================================================
-- pick_lead_scoring_rule(org, evento, canal): devolve os pontos a aplicar,
-- ou NULL se não há regra ativa. Prefere a regra do canal à regra geral.
--
-- STABLE + SECURITY DEFINER: chamada pelos webhooks (service-role) e por
-- triggers; sempre escopada por org.
-- =====================================================
CREATE OR REPLACE FUNCTION public.pick_lead_scoring_rule(
  p_org uuid,
  p_event text,
  p_channel text DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.points
  FROM public.lead_scoring_rules r
  WHERE r.org_id = p_org
    AND r.event_type = p_event
    AND r.is_active
    AND (r.channel IS NULL OR r.channel = p_channel)
  -- Regra do canal primeiro; a geral é o fallback.
  ORDER BY (r.channel IS NULL), r.created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.pick_lead_scoring_rule(uuid, text, text) TO authenticated;
