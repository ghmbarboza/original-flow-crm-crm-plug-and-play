-- Sprint 12 B7: kit inicial do wizard (24/09/2026).
--
-- Templates de WhatsApp gerados pelo kit ficam como rascunho até a org ter a
-- API oficial (Meta ou Zernio) e enviar para aprovação em Campanhas > Templates.
CREATE TABLE IF NOT EXISTS public.whatsapp_template_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'UTILITY' CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  language TEXT NOT NULL DEFAULT 'pt_BR',
  body_text TEXT NOT NULL,
  example_params JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'error')),
  error TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
ALTER TABLE public.whatsapp_template_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whatsapp_template_drafts_org" ON public.whatsapp_template_drafts;
CREATE POLICY "whatsapp_template_drafts_org" ON public.whatsapp_template_drafts
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));

-- Registro do que o wizard aplicou (para o passo "Kit inicial" não repetir).
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS starter_kit_applied_at TIMESTAMPTZ;
