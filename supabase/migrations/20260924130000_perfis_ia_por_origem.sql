-- Sprint 12 B4: perfis da IA por origem do lead (24/09/2026).
--
-- A IA atende com um perfil por org. Aqui cada origem (contacts.source:
-- formulário, meta_ads, indicação...) pode ter instrução extra no atendimento,
-- instrução e template próprios na abordagem ativa, modo do funil e etapa
-- inicial do negócio. Lido por ai-reply, ai-outreach e submit-capture-form.
CREATE TABLE IF NOT EXISTS public.ai_source_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  label TEXT,
  instruction TEXT NOT NULL DEFAULT '',
  outreach_instruction TEXT NOT NULL DEFAULT '',
  outreach_template_name TEXT,
  funnel_mode TEXT NOT NULL DEFAULT 'inherit' CHECK (funnel_mode IN ('inherit', 'auto', 'suggest')),
  initial_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, source)
);
ALTER TABLE public.ai_source_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_source_profiles_org" ON public.ai_source_profiles;
CREATE POLICY "ai_source_profiles_org" ON public.ai_source_profiles
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS idx_ai_source_profiles_lookup ON public.ai_source_profiles (org_id, lower(source)) WHERE is_active;
