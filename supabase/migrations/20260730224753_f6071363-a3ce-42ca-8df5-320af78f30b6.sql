UPDATE public.profiles SET crm_role = 'diretor', is_active = true, is_approved = true, updated_at = now() WHERE email = 'sabrina@viverdeia.ai';

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM public.profiles WHERE email = 'sabrina@viverdeia.ai'
ON CONFLICT (user_id, role) DO NOTHING;