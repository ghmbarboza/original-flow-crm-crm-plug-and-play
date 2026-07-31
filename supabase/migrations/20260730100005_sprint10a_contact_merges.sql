-- Sprint 10A-5 — Detecção e merge de duplicatas de contatos.
--
-- contact_merges é trilha de auditoria: quem mesclou o quê e quando. O contato
-- mesclado é DESATIVADO (is_active = false + merged_into_id), nunca deletado —
-- FKs sem ON DELETE CASCADE aqui são deliberadas.
--
-- contacts.merged_into_id já existia no banco (aparece nos types desde antes);
-- o ADD COLUMN IF NOT EXISTS absorve a diferença sem erro.

CREATE TABLE IF NOT EXISTS public.contact_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  primary_contact_id UUID NOT NULL REFERENCES public.contacts(id),
  merged_contact_id UUID NOT NULL REFERENCES public.contacts(id),
  merged_by UUID REFERENCES auth.users(id),
  merged_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contact_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_merges_org" ON public.contact_merges;
CREATE POLICY "contact_merges_org" ON public.contact_merges
  FOR ALL USING (user_belongs_to_org(org_id));

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.contacts(id),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Contatos mesclados não aparecem nas listagens.
CREATE INDEX IF NOT EXISTS idx_contacts_active ON public.contacts(org_id, is_active)
  WHERE is_active = true;
