-- Primeiro acesso: a tela de login sabe quando a instância ainda não tem ninguém.
--
-- Num projeto recém-remixado, o primeiro cadastro é o dono da conta: entra como
-- admin, aprovado, e a organização nasce com ele (handle_new_user +
-- assign_default_org). Só que a tela mostrava "Entrar" e escondia o cadastro
-- atrás do botão "Criar conta", como se a conta já existisse. Mesma ideia do
-- has_any_organization da Gestão de RH.
--
-- A função responde só um booleano e é chamada SEM login, então não vaza nada:
-- não diz quantas pessoas existem nem quem são.
CREATE OR REPLACE FUNCTION public.instancia_sem_usuarios()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles);
$$;

REVOKE ALL ON FUNCTION public.instancia_sem_usuarios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.instancia_sem_usuarios() TO anon, authenticated, service_role;
