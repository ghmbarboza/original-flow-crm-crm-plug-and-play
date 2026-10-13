-- Fecha a entrada de estranhos na organização.
--
-- Em 13/10/2026, seis contas de fora estavam dentro da organização do projeto
-- original: o cadastro público nascia aprovado (a exigência de aprovação só
-- valia com a configuração gravada, e ela nunca foi) e o gatilho
-- assign_default_org coloca todo perfil novo na primeira organização. Uma delas
-- trocou o canal de WhatsApp da conta.
--
-- 1. Conta pendente ou inativa não enxerga a organização: as 113 policies por
--    organização passam por user_belongs_to_org() -> current_org_id(), então a
--    regra entra em um lugar só. O próprio perfil continua legível (policy por
--    auth.uid()), que é o que a tela "aguardando aprovação" precisa.
-- 2. Cadastro novo exige aprovação por padrão. O primeiro usuário da instalação
--    continua entrando direto como admin.
-- 3. Trocar o canal de atendimento é só de administrador.

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT org_id FROM public.profiles
  WHERE id = auth.uid() AND is_approved AND is_active;
$$;

DROP POLICY IF EXISTS org_members_all ON public.messaging_config;
DROP POLICY IF EXISTS org_members_select ON public.messaging_config;
DROP POLICY IF EXISTS org_admins_write ON public.messaging_config;
CREATE POLICY org_members_select ON public.messaging_config
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
CREATE POLICY org_admins_write ON public.messaging_config
  FOR ALL TO authenticated
  USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));

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
  -- Remix não copia dados: a configuração nasce aqui, ligada, para a tela de
  -- Segurança mostrar o mesmo que o gatilho aplica (e o admin poder desligar).
  INSERT INTO public.project_config (key, value, updated_at)
  SELECT 'require_account_approval', 'true', now()
  WHERE NOT EXISTS (SELECT 1 FROM public.project_config WHERE key = 'require_account_approval');

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
    OR position('''agent''::app_role' in _def) > 0
    -- Versão antiga aprovava sozinha quem se cadastrava sem a configuração gravada.
    OR position('COALESCE(_require_approval, true)' in _def) = 0;

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
      _require_approval := COALESCE(_require_approval, true);
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

-- Aplica já nesta instalação (a função antiga é detectada como desatualizada).
SELECT public.ensure_auth_trigger();
