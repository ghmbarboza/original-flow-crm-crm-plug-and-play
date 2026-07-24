-- =====================================================
-- FlowCRM 2.0 — Migration: estende is_demo às demais tabelas do seed de demo
--
-- O seed de demonstração passa a cobrir também conversas (WhatsApp/canais),
-- mensagens, emails, metas de vendas e histórico de lead scoring — de modo que
-- TODAS as telas mostrem dados fictícios coerentes. A flag is_demo permite
-- limpar apenas esses registros (org_id + is_demo) sem tocar em dados reais.
-- =====================================================

ALTER TABLE public.conversations         ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.conversation_messages ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.emails                ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales_goals           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.lead_score_history    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS conversations_demo_idx         ON public.conversations         (org_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS conversation_messages_demo_idx ON public.conversation_messages (org_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS emails_demo_idx                ON public.emails                (org_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS sales_goals_demo_idx           ON public.sales_goals           (org_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS lead_score_history_demo_idx    ON public.lead_score_history    (org_id) WHERE is_demo;
