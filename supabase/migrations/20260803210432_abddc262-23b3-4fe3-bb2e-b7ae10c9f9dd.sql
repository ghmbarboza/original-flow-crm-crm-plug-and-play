-- Wrappers em `public` para o Vault: PostgREST só enxerga o schema `public`,
-- então `rpc("create_secret")` falhava enquanto a função existia apenas em
-- `vault`. Idempotente por design (CREATE OR REPLACE + upsert por nome): o
-- banco de produção já está exatamente neste estado.
CREATE OR REPLACE FUNCTION public.create_secret(
  new_secret text,
  new_name text,
  new_description text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  sid uuid;
BEGIN
  SELECT id INTO sid FROM vault.secrets WHERE name = new_name;
  IF sid IS NOT NULL THEN
    PERFORM vault.update_secret(sid, new_secret, new_name, new_description);
    RETURN sid;
  END IF;
  RETURN vault.create_secret(new_secret, new_name, new_description);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vault_update_secret(
  secret_id uuid,
  new_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM vault.update_secret(secret_id, new_secret);
END;
$function$;

-- Só o service_role (edge functions) pode manipular segredos.
REVOKE ALL ON FUNCTION public.create_secret(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vault_update_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_secret(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_update_secret(uuid, text) TO service_role;