-- =====================================================
-- Auth fix: handle_new_user() completo com bootstrap de role.
-- Regressão documentada: a função não inseria em user_roles nem marcava o
-- primeiro usuário como admin. Aqui restauramos a lógica completa já com o
-- role padronizado 'member' (substitui o legado 'agent').
--
-- Regras:
--   - LOCK TABLE profiles IN SHARE ROW EXCLUSIVE MODE  (evita race no 1º usuário)
--   - conta profiles → is_first_user
--   - lê require_account_approval em project_config
--   - profiles.is_approved = true se first_user, senão NOT require_approval
--   - user_roles.role = 'admin' se first_user, senão 'member'
--   - ON CONFLICT DO NOTHING nos dois inserts
-- Idempotente / remix-safe.
-- =====================================================

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
  -- Serializa a checagem de "primeiro usuário" para evitar dois admins em signups concorrentes.
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
    CASE WHEN _is_first_user THEN 'admin'::app_role ELSE 'member'::app_role END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- ensure_auth_trigger(): auto-cura em remix. Recria a função COM a lógica
-- completa (não apenas o trigger), para que projetos remixados que perderam a
-- função ou tenham uma versão antiga com 'agent' fiquem consistentes.
-- =====================================================
CREATE OR REPLACE FUNCTION public.ensure_auth_trigger()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exists boolean;
  _def text;
  _outdated boolean;
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

  -- Considera desatualizada a função que não insere role, não marca admin, ou ainda cita 'agent'.
  BEGIN
    _def := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  EXCEPTION WHEN OTHERS THEN
    _def := '';
  END;
  _outdated := _def = ''
    OR position('public.user_roles' in _def) = 0
    OR position('''admin''::app_role' in _def) = 0
    OR position('''member''::app_role' in _def) = 0
    OR position('''agent''::app_role' in _def) > 0;

  IF _exists AND NOT _outdated THEN
    RETURN jsonb_build_object('ok', true, 'created', false, 'message', 'Trigger e função já corretos');
  END IF;

  -- Recria a função com a lógica completa e padronizada.
  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
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
        NEW.id, NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
        NEW.raw_user_meta_data->>'avatar_url',
        'offline', true,
        CASE WHEN _is_first_user THEN true WHEN _require_approval THEN false ELSE true END,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, CASE WHEN _is_first_user THEN 'admin'::app_role ELSE 'member'::app_role END)
      ON CONFLICT (user_id, role) DO NOTHING;
      RETURN NEW;
    END;
    $fn$;
  $ddl$;

  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated';
  EXECUTE 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users';
  EXECUTE 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';

  RETURN jsonb_build_object('ok', true, 'created', true, 'message', 'Trigger e função recriados');
EXCEPTION WHEN insufficient_privilege THEN
  RETURN jsonb_build_object('ok', false, 'created', false, 'message', 'Insufficient privilege to manage auth.users trigger');
WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'created', false, 'message', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_auth_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_auth_trigger() TO service_role;
