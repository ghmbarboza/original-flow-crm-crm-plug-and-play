-- Sprint 10A-2 — Respostas rápidas do inbox (atalho "/" no campo de mensagem).
--
-- Idempotente por construção (lição do Sprint 9): IF NOT EXISTS em tabela e
-- índice, DROP POLICY IF EXISTS antes do CREATE POLICY (que não aceita
-- IF NOT EXISTS). Reexecutar a migration inteira é seguro.

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,          -- ex: 'proposta', 'preco'
  title TEXT NOT NULL,             -- label exibida na lista
  message TEXT NOT NULL,           -- texto com suporte a variáveis {{contact.first_name}}
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, shortcut)
);

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quick_replies_org" ON public.quick_replies;
CREATE POLICY "quick_replies_org" ON public.quick_replies
  FOR ALL USING (user_belongs_to_org(org_id));

CREATE INDEX IF NOT EXISTS idx_quick_replies_org ON public.quick_replies(org_id, shortcut);
