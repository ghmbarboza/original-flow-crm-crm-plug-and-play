-- =====================================================
-- FlowCRM 2.0 — Sprint 9 revisado / Migration 9C
-- Contexto da empresa e progresso do wizard de setup.
--
-- Estas colunas são a matéria-prima da geração do system prompt: sem elas a IA
-- é configurada no escuro, com nome e tom genéricos. Também alimentam a
-- sugestão de pipeline por setor e, no Sprint 10, a personalização dos modelos.
--
-- DESVIO DELIBERADO DO PLANO: a policy de setup_progress usa o helper
-- user_belongs_to_org() em vez da subquery inline em profiles que o doc trazia.
-- A subquery recursaria no RLS de profiles; o helper é SECURITY DEFINER e
-- STABLE, e é o padrão que o resto do projeto usa.
--
-- business_sector e brand_tone ganharam CHECK. O doc os deixava como texto livre
-- "para permitir expansão sem migration", mas setor é chave de lookup para
-- pipeline e templates — um valor fora da lista quebraria silenciosamente a
-- sugestão, caindo sempre no fallback sem ninguém perceber.
-- =====================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_sector TEXT,
  -- O que a empresa vende e para quem.
  ADD COLUMN IF NOT EXISTS business_description TEXT,
  ADD COLUMN IF NOT EXISTS target_audience TEXT,
  ADD COLUMN IF NOT EXISTS main_problem_solved TEXT,
  ADD COLUMN IF NOT EXISTS brand_tone TEXT DEFAULT 'profissional',
  -- O que a IA nunca deve fazer; vira a seção de proibições do prompt.
  ADD COLUMN IF NOT EXISTS ai_prohibitions TEXT,
  ADD COLUMN IF NOT EXISTS good_response_example TEXT,
  ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_brand_tone_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_brand_tone_check
  CHECK (brand_tone IN ('profissional','consultivo','amigavel','tecnico','descontraido'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_business_sector_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_business_sector_check
  CHECK (business_sector IS NULL OR business_sector IN (
    'imobiliario','saude','educacao','varejo','servicos','tecnologia',
    'juridico','financeiro','alimentacao','beleza','outro'
  ));

-- Progresso do wizard, por organização. UNIQUE(org_id) porque o setup é da
-- empresa, não do usuário: quem termina, termina para todos.
CREATE TABLE IF NOT EXISTS public.setup_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  completed_steps TEXT[] DEFAULT '{}',
  current_step TEXT DEFAULT 'empresa',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.setup_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "setup_progress_own_org" ON public.setup_progress;
CREATE POLICY "setup_progress_own_org" ON public.setup_progress
  FOR ALL TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

CREATE INDEX IF NOT EXISTS idx_setup_progress_org ON public.setup_progress(org_id);
