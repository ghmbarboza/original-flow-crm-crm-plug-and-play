-- Histórico do assistente do CRM no banco (14/10/2026).
--
-- Antes as conversas ficavam só no navegador: trocar de computador ou limpar o
-- navegador perdia tudo. Agora cada conversa é uma linha, visível só para quem
-- conversou (nem administrador lê a conversa de outra pessoa). Conta pendente
-- ou desativada não grava: current_org_id() exige aprovado e ativo.

CREATE TABLE IF NOT EXISTS public.assistente_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 120),
  mensagens JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(mensagens) = 'array' AND pg_column_size(mensagens) <= 524288),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistente_conversas_usuario_idx
  ON public.assistente_conversas (user_id, updated_at DESC);

ALTER TABLE public.assistente_conversas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistente_conversas_proprias ON public.assistente_conversas;
CREATE POLICY assistente_conversas_proprias ON public.assistente_conversas
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND org_id = public.current_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());

-- Teto por pessoa: ao passar de 100 conversas, as mais antigas saem. Sem isso
-- um token roubado poderia encher o banco em loop de inserts.
CREATE OR REPLACE FUNCTION public.tg_assistente_conversas_teto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.assistente_conversas
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM public.assistente_conversas
      WHERE user_id = NEW.user_id
      ORDER BY updated_at DESC
      LIMIT 100
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS assistente_conversas_teto ON public.assistente_conversas;
CREATE TRIGGER assistente_conversas_teto
  AFTER INSERT ON public.assistente_conversas
  FOR EACH ROW EXECUTE FUNCTION public.tg_assistente_conversas_teto();

REVOKE ALL ON public.assistente_conversas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistente_conversas TO authenticated;
