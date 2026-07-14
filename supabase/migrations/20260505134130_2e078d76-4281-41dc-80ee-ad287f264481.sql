-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'agent');

-- Tables
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE public.project_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.project_config (key, value) VALUES
  ('restrict_signup_by_domain', 'false'),
  ('allowed_email_domains', ''),
  ('require_account_approval', 'false');

CREATE TABLE public.api_keys_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  vault_secret_id UUID NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, service_name)
);

-- has_role function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service inserts profiles" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.project_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read config" ON public.project_config FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update config" ON public.project_config FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.api_keys_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own keys" ON public.api_keys_registry FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user_count INTEGER;
  _require_approval BOOLEAN;
  _is_first_user BOOLEAN;
BEGIN
  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO _user_count FROM public.profiles;
  _is_first_user := (_user_count = 0);
  SELECT (value = 'true') INTO _require_approval FROM public.project_config WHERE key = 'require_account_approval';
  INSERT INTO public.profiles (id, full_name, email, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
    NEW.email,
    CASE WHEN _is_first_user THEN true WHEN _require_approval THEN false ELSE true END
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_first_user THEN 'admin'::app_role ELSE 'agent'::app_role END);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- check_email_domain trigger
CREATE OR REPLACE FUNCTION public.check_email_domain()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _restrict BOOLEAN; _domains TEXT; _email_domain TEXT;
  _allowed_domain TEXT; _is_allowed BOOLEAN := false; _user_count INTEGER;
BEGIN
  SELECT count(*) INTO _user_count FROM public.profiles;
  IF _user_count = 0 THEN RETURN NEW; END IF;
  SELECT (value = 'true') INTO _restrict FROM public.project_config WHERE key = 'restrict_signup_by_domain';
  IF NOT _restrict THEN RETURN NEW; END IF;
  SELECT value INTO _domains FROM public.project_config WHERE key = 'allowed_email_domains';
  _email_domain := split_part(NEW.email, '@', 2);
  FOR _allowed_domain IN SELECT trim(unnest(string_to_array(_domains, ',')))
  LOOP
    IF _email_domain = _allowed_domain OR _email_domain LIKE '%.' || _allowed_domain THEN
      _is_allowed := true; EXIT;
    END IF;
  END LOOP;
  IF NOT _is_allowed THEN
    RAISE EXCEPTION 'Domínio de email não permitido: %', _email_domain;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_domain_before_signup ON auth.users;
CREATE TRIGGER check_domain_before_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.check_email_domain();