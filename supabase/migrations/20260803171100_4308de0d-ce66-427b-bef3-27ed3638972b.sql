CREATE OR REPLACE FUNCTION public.get_org_api_key(_org_id uuid, _service text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT s.decrypted_secret
  FROM public.api_keys_registry r
  JOIN vault.decrypted_secrets s ON s.id = r.vault_secret_id
  WHERE r.org_id = _org_id
    AND r.service_name = _service
    AND COALESCE(r.is_active, true)
  ORDER BY r.updated_at DESC NULLS LAST
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_org_api_key(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_api_key(uuid, text) TO service_role;