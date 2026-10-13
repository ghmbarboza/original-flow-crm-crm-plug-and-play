-- 13/10/2026: a IA passa a aceitar chave própria da organização (Anthropic,
-- OpenAI, Gemini), cadastrada em Configurações > Integrações, com a IA da
-- plataforma de reserva.
--
-- Quem tem a chave de IA em uso lê todo o texto que a IA processa (conversas,
-- base de conhecimento, dados do CRM) no painel do provedor. Por isso só vale
-- chave cadastrada por ADMINISTRADOR ATIVO da própria organização. A regra fica
-- aqui, na leitura, e não só na function que grava: a linha de
-- api_keys_registry é do usuário (RLS "Users manage own keys") e ele consegue
-- alterá-la direto, então conferir só na gravação não bastaria.
--
-- Uma chamada devolve todas as chaves de IA da organização: a IA lê isto a
-- cada mensagem, e a maioria das contas não tem chave própria.
CREATE OR REPLACE FUNCTION public.get_org_ai_keys(_org_id uuid)
RETURNS TABLE (service_name text, api_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT DISTINCT ON (r.service_name) r.service_name, s.decrypted_secret
    FROM public.api_keys_registry r
    JOIN public.profiles p ON p.id = r.user_id
    JOIN vault.decrypted_secrets s ON s.id = r.vault_secret_id
   WHERE r.org_id = _org_id
     AND r.service_name IN ('anthropic', 'openai', 'gemini')
     AND COALESCE(r.is_active, true)
     AND p.org_id = _org_id
     AND p.is_approved AND p.is_active
     AND public.has_role(r.user_id, 'admin'::public.app_role)
   ORDER BY r.service_name, r.updated_at DESC NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.get_org_ai_keys(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_ai_keys(uuid) TO service_role;
