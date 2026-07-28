-- 1. zernio_configs — admin only
DROP POLICY IF EXISTS "zernio_configs_read" ON public.zernio_configs;
DROP POLICY IF EXISTS "zernio_configs_write" ON public.zernio_configs;
DROP POLICY IF EXISTS "org_admins_all" ON public.zernio_configs;
CREATE POLICY "org_admins_all" ON public.zernio_configs
  FOR ALL TO authenticated
  USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. whatsapp-media — policies escopadas por org
DROP POLICY IF EXISTS "whatsapp media public read" ON storage.objects;
DROP POLICY IF EXISTS "whatsapp media authenticated write" ON storage.objects;

DROP POLICY IF EXISTS "whatsapp_media_org_read" ON storage.objects;
CREATE POLICY "whatsapp_media_org_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

DROP POLICY IF EXISTS "whatsapp_media_org_write" ON storage.objects;
CREATE POLICY "whatsapp_media_org_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
  );

DROP POLICY IF EXISTS "whatsapp_media_admin_delete" ON storage.objects;
CREATE POLICY "whatsapp_media_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = public.current_org_id()::text
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- 3. capture_forms — remove leitura anônima
DROP POLICY IF EXISTS "capture_forms_public_read" ON public.capture_forms;