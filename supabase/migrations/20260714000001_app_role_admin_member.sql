-- =====================================================
-- Padroniza app_role para ('admin', 'member')
-- Remove os valores legados 'supervisor' e 'agent'.
-- Mapeamento de dados existentes: admin → admin, supervisor|agent → member.
--
-- O tipo app_role tem dependentes (coluna user_roles.role, função has_role e
-- as policies que a chamam), então trocamos o tipo com cuidado:
--   drop policies → drop has_role → swap type → recreate has_role → recreate policies.
-- Idempotente / remix-safe: só executa o swap se 'member' ainda não existir.
-- =====================================================

-- 1. Remove policies dependentes de has_role (recriadas ao final).
DROP POLICY IF EXISTS "Admins read all profiles"   ON public.profiles;
DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins manage roles"        ON public.user_roles;
DROP POLICY IF EXISTS "Admins read config"         ON public.project_config;
DROP POLICY IF EXISTS "Admins update config"       ON public.project_config;

-- 2. Remove has_role (depende do tipo app_role).
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 3. Swap do enum, apenas se ainda não estiver no formato novo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'member'
  ) THEN
    -- 3a. Deduplica roles que colidiriam após o mapeamento (supervisor + agent → member).
    DELETE FROM public.user_roles a
    USING public.user_roles b
    WHERE a.ctid < b.ctid
      AND a.user_id = b.user_id
      AND a.role::text IN ('supervisor', 'agent')
      AND b.role::text IN ('supervisor', 'agent');

    -- 3b. Remove default e renomeia o tipo antigo.
    ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;
    ALTER TYPE public.app_role RENAME TO app_role_old;

    -- 3c. Cria o novo tipo e converte a coluna mapeando valores legados.
    CREATE TYPE public.app_role AS ENUM ('admin', 'member');
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE public.app_role
      USING (CASE WHEN role::text = 'admin' THEN 'admin' ELSE 'member' END::public.app_role);

    -- 3d. Restaura default e descarta o tipo antigo.
    ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'member';
    DROP TYPE public.app_role_old;
  END IF;
END $$;

-- 4. Recria has_role com a assinatura do novo tipo.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 5. Recria as policies de admin.
CREATE POLICY "Admins read all profiles"   ON public.profiles       FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all profiles" ON public.profiles       FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles"        ON public.user_roles     FOR ALL    USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins read config"         ON public.project_config FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update config"       ON public.project_config FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- 6. Recria handle_new_user referenciando 'member' (a versão antiga citava 'agent'::app_role,
--    literal que deixaria de ser válido após o swap). A migration seguinte (auth fix) reescreve
--    esta função com a lógica completa — aqui garantimos apenas consistência imediata do tipo.
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

  INSERT INTO public.profiles (id, email, full_name, avatar_url, status, is_active, is_approved, created_at, updated_at)
  VALUES (
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
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
