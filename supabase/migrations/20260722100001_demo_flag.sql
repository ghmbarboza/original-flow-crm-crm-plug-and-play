-- =====================================================
-- FlowCRM 2.0 — Migration: flag de dados de demonstração
--
-- Adiciona `is_demo` às tabelas populadas pela edge function `demo-data`.
-- A flag permite semear dados fictícios e depois limpá-los sem tocar em dados
-- reais do org. NÃO existe tabela `tasks` neste schema: tarefas são `activities`
-- com type = 'task', então a flag em `activities` já cobre atividades e tarefas.
--
-- Índice parcial por (org_id) WHERE is_demo: a limpeza filtra sempre por
-- org_id + is_demo, e o índice parcial mantém apenas as linhas de demo,
-- tornando o DELETE eficiente sem custo nas linhas reais.
-- =====================================================

ALTER TABLE public.companies  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.deals      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.products   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS companies_demo_idx  ON public.companies  (org_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS contacts_demo_idx   ON public.contacts   (org_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS deals_demo_idx       ON public.deals      (org_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS activities_demo_idx ON public.activities (org_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS products_demo_idx   ON public.products   (org_id) WHERE is_demo;
