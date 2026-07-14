REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_email_domain() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
-- has_role must remain callable by authenticated users for RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;