-- Restaura handle_new_user com lógica completa (first user = admin, role, approval)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_count INTEGER;
  _require_approval BOOLEAN := false;
  _is_first_user BOOLEAN;
BEGIN
  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO _user_count FROM public.profiles;
  _is_first_user := (_user_count = 0);

  SELECT (value = 'true') INTO _require_approval
  FROM public.project_config WHERE key = 'require_account_approval';
  _require_approval := COALESCE(_require_approval, false);

  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, status, is_active, is_approved, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
    NEW.raw_user_meta_data->>'avatar_url',
    'offline',
    true,
    CASE WHEN _is_first_user THEN true
         WHEN _require_approval THEN false
         ELSE true END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN _is_first_user THEN 'admin'::app_role ELSE 'agent'::app_role END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Atualiza ensure_auth_trigger para recriar a versão correta
CREATE OR REPLACE FUNCTION public.ensure_auth_trigger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
      AND NOT t.tgisinternal
  ) INTO _exists;

  IF _exists THEN
    RETURN jsonb_build_object('ok', true, 'created', false, 'message', 'Trigger already exists');
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
  EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';

  RETURN jsonb_build_object('ok', true, 'created', true, 'message', 'Trigger recreated');
EXCEPTION WHEN insufficient_privilege THEN
  RETURN jsonb_build_object('ok', false, 'created', false, 'message', 'Insufficient privilege to manage auth.users trigger');
WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'created', false, 'message', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_auth_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_auth_trigger() TO service_role;

-- Permite inspecionar o corpo da handle_new_user para detectar versões antigas
CREATE OR REPLACE FUNCTION public.get_handle_new_user_def()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure);
$$;

REVOKE EXECUTE ON FUNCTION public.get_handle_new_user_def() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_handle_new_user_def() TO service_role;