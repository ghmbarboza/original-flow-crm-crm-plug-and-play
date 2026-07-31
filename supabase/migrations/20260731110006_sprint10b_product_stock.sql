-- Sprint 10B-6 — Controle de estoque em produtos.
--
-- stock_quantity NULL = ilimitado (serviços). O decremento/recomposição por
-- deal ganho/perdido entra na Parte 7 (trigger); esta migration é só schema.
--
-- A view leva security_invoker: sem isso ela rodaria com os privilégios do
-- dono e atravessaria o RLS de products/deals.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS stock_minimum_alert INTEGER,
  ADD COLUMN IF NOT EXISTS track_stock BOOLEAN DEFAULT false;

CREATE OR REPLACE VIEW public.products_with_metrics
WITH (security_invoker = on) AS
SELECT
  p.*,
  COUNT(dp.id) FILTER (WHERE d.status = 'open') AS deals_in_progress,
  COUNT(dp.id) FILTER (WHERE d.status = 'won') AS deals_won,
  SUM(dp.total_price) FILTER (WHERE d.status = 'won') AS total_revenue
FROM public.products p
LEFT JOIN public.deal_products dp ON dp.product_id = p.id
LEFT JOIN public.deals d ON d.id = dp.deal_id
GROUP BY p.id;
