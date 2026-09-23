-- Sprint 12 B13, revisão de segurança: campanhas de ligação (discagem em lote)
-- só por administradores; membros continuam lendo o andamento.
DROP POLICY IF EXISTS "voice_campaigns_org" ON public.voice_campaigns;
CREATE POLICY "voice_campaigns_select" ON public.voice_campaigns
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
CREATE POLICY "voice_campaigns_admin_insert" ON public.voice_campaigns
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "voice_campaigns_admin_update" ON public.voice_campaigns
  FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "voice_campaigns_admin_delete" ON public.voice_campaigns
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "voice_campaign_contacts_org" ON public.voice_campaign_contacts;
CREATE POLICY "voice_campaign_contacts_select" ON public.voice_campaign_contacts
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
CREATE POLICY "voice_campaign_contacts_admin_insert" ON public.voice_campaign_contacts
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "voice_campaign_contacts_admin_update" ON public.voice_campaign_contacts
  FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "voice_campaign_contacts_admin_delete" ON public.voice_campaign_contacts
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'::app_role));
