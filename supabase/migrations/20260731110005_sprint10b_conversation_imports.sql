-- Sprint 10B-5 — Importação de histórico de conversas.
--
-- conversation_imports rastreia cada importação (origem, totais, status);
-- conversations.import_id marca as conversas importadas para distingui-las
-- das orgânicas — importadas nascem encerradas e a IA não responde nelas.

CREATE TABLE IF NOT EXISTS public.conversation_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_platform TEXT NOT NULL,
  file_name TEXT,
  total_conversations INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_msg TEXT,
  imported_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.conversation_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "imports_admin" ON public.conversation_imports;
CREATE POLICY "imports_admin" ON public.conversation_imports
  FOR ALL USING (
    user_belongs_to_org(org_id)
    AND has_role(auth.uid(), 'admin'::app_role)
  );

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.conversation_imports(id),
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
