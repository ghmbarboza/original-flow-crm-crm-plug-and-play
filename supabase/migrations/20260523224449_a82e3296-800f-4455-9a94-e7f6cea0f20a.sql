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

  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      INSERT INTO public.profiles (
        id, email, full_name, avatar_url, status, is_active, is_approved, created_at, updated_at
      ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        NEW.raw_user_meta_data->>'avatar_url',
        'offline', true, false, NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $fn$;
  $ddl$;

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