-- Sprint 10B-2 — Previsão de fechamento por IA.
--
-- O cálculo vive na edge function predict-deal-close; o banco guarda o último
-- resultado (percentual + fatores) e quando foi calculado, para o card do
-- kanban e o forecast dos relatórios não recalcularem a cada render.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS ai_close_probability NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_close_probability_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_close_factors JSONB DEFAULT '[]';
