-- =====================================================
-- FlowCRM 2.0 — Sprint 9 / Migration 9A: biblioteca de modelos
--
-- library_templates é GLOBAL, não por org: os modelos são conteúdo de partida
-- da plataforma, iguais para todo mundo. Por isso a policy de leitura não filtra
-- por org_id — filtra por is_active, para modelo desativado sumir sem delete.
--
-- from_template_id nas seis tabelas de destino registra a origem de cada
-- registro criado a partir de um modelo. Serve para analytics e para saber o
-- que veio pronto versus o que o usuário escreveu.
-- =====================================================

-- Tabela central de modelos da biblioteca
CREATE TABLE public.library_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'email_sequence', 'email_template', 'followup', 'automation', 'ai_faq', 'ai_objection'
  )),
  subcategory TEXT NOT NULL CHECK (subcategory IN (
    'prospeccao', 'nutricao', 'retencao', 'reengajamento', 'pos_venda', 'boas_vindas', 'geral'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  preview TEXT,               -- texto curto de preview (primeira mensagem, assunto, etc.)
  content JSONB NOT NULL,     -- conteúdo completo do modelo (estrutura varia por categoria)
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para listagem por categoria
-- Um modelo por (categoria, título). Além de barrar duplicata acidental, é esta
-- chave que permite o seed da 9B rodar de novo sem inserir tudo outra vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_templates_unique
  ON public.library_templates(category, title);

CREATE INDEX IF NOT EXISTS idx_library_templates_category ON public.library_templates(category, is_active, sort_order);

-- RLS: leitura para todos os autenticados (modelos são globais, não por org)
ALTER TABLE public.library_templates ENABLE ROW LEVEL SECURITY;

-- DROP antes do CREATE: sem isso, reexecutar a migration falha com
-- "policy already exists" — o resto do arquivo usa IF NOT EXISTS, mas
-- CREATE POLICY não aceita essa forma.
DROP POLICY IF EXISTS "library_templates_read" ON public.library_templates;
CREATE POLICY "library_templates_read" ON public.library_templates
  FOR SELECT TO authenticated USING (is_active = true);

-- Rastrear origem dos registros criados a partir de modelos
ALTER TABLE public.email_sequences
  ADD COLUMN IF NOT EXISTS from_template_id UUID REFERENCES public.library_templates(id);

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS from_template_id UUID REFERENCES public.library_templates(id);

ALTER TABLE public.followup_configs
  ADD COLUMN IF NOT EXISTS from_template_id UUID REFERENCES public.library_templates(id);

ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS from_template_id UUID REFERENCES public.library_templates(id);

ALTER TABLE public.ai_knowledge_faqs
  ADD COLUMN IF NOT EXISTS from_template_id UUID REFERENCES public.library_templates(id);

ALTER TABLE public.ai_knowledge_objections
  ADD COLUMN IF NOT EXISTS from_template_id UUID REFERENCES public.library_templates(id);
