-- Sprint 12 B6: produtos e serviços + modelo de negócio (24/09/2026).
--
-- products ganha tipo (produto, serviço, assinatura), forma de cobrança (única,
-- mensal, anual, por hora), unidade, duração e taxa de adesão. A organização
-- declara como vende (B2B, B2C, B2B2C, misto) e o que vende; o negócio em B2B
-- exige empresa.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'product' CHECK (kind IN ('product', 'service', 'subscription')),
  ADD COLUMN IF NOT EXISTS billing TEXT NOT NULL DEFAULT 'one_time' CHECK (billing IN ('one_time', 'monthly', 'yearly', 'hourly')),
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS setup_fee NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_model TEXT NOT NULL DEFAULT 'mixed' CHECK (business_model IN ('b2b', 'b2c', 'b2b2c', 'mixed')),
  ADD COLUMN IF NOT EXISTS sells TEXT NOT NULL DEFAULT 'both' CHECK (sells IN ('products', 'services', 'both'));

-- Item do negócio guarda a cobrança do momento (o produto pode mudar depois).
ALTER TABLE public.deal_products
  ADD COLUMN IF NOT EXISTS billing TEXT NOT NULL DEFAULT 'one_time' CHECK (billing IN ('one_time', 'monthly', 'yearly', 'hourly'));
