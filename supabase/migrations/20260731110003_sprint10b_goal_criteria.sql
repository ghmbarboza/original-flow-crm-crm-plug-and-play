-- Sprint 10B-3 — Metas por critério de deal.
--
-- goal_subtype qualifica a meta ('min_deal_value', 'conversion_rate',
-- 'avg_response_time', 'deals_per_stage'); criteria guarda os parâmetros do
-- critério (ex.: {"min_value": 10000}).

ALTER TABLE public.sales_goals
  ADD COLUMN IF NOT EXISTS goal_subtype TEXT,
  ADD COLUMN IF NOT EXISTS criteria JSONB DEFAULT '{}';
