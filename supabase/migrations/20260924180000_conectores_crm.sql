-- Sprint 12 B9: conectores com outros CRMs (24/09/2026).
--
-- crm_connections: uma conexão por CRM de origem (HubSpot, Pipedrive, RD
-- Station CRM, Agendor, Kommo, Salesforce). O segredo (token ou refresh token)
-- fica no Vault; aqui só o id do segredo, o domínio da conta, a estrutura lida
-- (funis, etapas, campos, contagens) e o resultado da última sincronização.
-- api_base existe para o hard smoke apontar a integration-sandbox.
CREATE TABLE IF NOT EXISTS public.crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('hubspot', 'pipedrive', 'rdstation', 'agendor', 'kommo', 'salesforce')),
  auth_type TEXT NOT NULL DEFAULT 'token' CHECK (auth_type IN ('token', 'oauth')),
  label TEXT,
  vault_secret_id UUID,
  account_domain TEXT,
  api_base TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'disconnected')),
  structure JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_connections_org" ON public.crm_connections;
CREATE POLICY "crm_connections_org" ON public.crm_connections
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));

-- Segredo da conexão, só para as functions (service role).
CREATE OR REPLACE FUNCTION public.segredo_conexao_crm(p_connection UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT s.decrypted_secret
  FROM public.crm_connections c
  JOIN vault.decrypted_secrets s ON s.id = c.vault_secret_id
  WHERE c.id = p_connection
$$;
REVOKE ALL ON FUNCTION public.segredo_conexao_crm(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.segredo_conexao_crm(UUID) TO service_role;

-- Apagar a conexão apaga o segredo do Vault (troca de token ou desconexão).
CREATE OR REPLACE FUNCTION public.apagar_segredo_conexao_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF OLD.vault_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.vault_secret_id;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS tg_crm_connections_segredo ON public.crm_connections;
CREATE TRIGGER tg_crm_connections_segredo
  BEFORE DELETE ON public.crm_connections
  FOR EACH ROW EXECUTE FUNCTION public.apagar_segredo_conexao_crm();

-- Estados do OAuth (Salesforce): uso único, com validade.
CREATE TABLE IF NOT EXISTS public.crm_oauth_states (
  state TEXT PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  user_id UUID,
  app_origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_oauth_states ENABLE ROW LEVEL SECURITY;

-- imports.source aceita o provedor e a conexão de origem.
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.crm_connections(id) ON DELETE SET NULL;
