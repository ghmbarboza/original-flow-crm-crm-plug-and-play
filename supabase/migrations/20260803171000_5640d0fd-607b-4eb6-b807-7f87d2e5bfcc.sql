ALTER TABLE public.api_keys_registry
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.api_keys_registry r
   SET org_id = p.org_id
  FROM public.profiles p
 WHERE p.id = r.user_id AND r.org_id IS NULL;

CREATE INDEX IF NOT EXISTS api_keys_registry_org_service_idx
  ON public.api_keys_registry (org_id, service_name);

DROP POLICY IF EXISTS "Org members can see which keys exist" ON public.api_keys_registry;
CREATE POLICY "Org members can see which keys exist"
  ON public.api_keys_registry
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(org_id));