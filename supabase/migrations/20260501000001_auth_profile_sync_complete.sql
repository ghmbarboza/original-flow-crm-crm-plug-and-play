-- Remix-safe: idempotently (re)create handle_new_user with full profile + role bootstrap.
-- Reapplies on every remix so trigger logic survives even if base tables were rebuilt.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_count INTEGER;
  _require_approval BOOLEAN;
  _is_first_user BOOLEAN;
BEGIN
  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO _user_count FROM public.profiles;
  _is_first_user := (_user_count = 0);
  SELECT (value = 'true') INTO _require_approval
    FROM public.project_config WHERE key = 'require_account_approval';
  INSERT INTO public.profiles (id, full_name, email, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
    NEW.email,
    CASE
      WHEN _is_first_user THEN true
      WHEN _require_approval THEN false
      ELSE true
    END
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN _is_first_user THEN 'admin'::app_role ELSE 'agent'::app_role END
  ) ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
