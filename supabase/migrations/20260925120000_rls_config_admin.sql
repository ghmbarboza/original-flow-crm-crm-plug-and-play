-- Estresse de papéis (25/09/2026): membro comum conseguia, direto pelo banco, desligar a IA,
-- editar formulários, e-mail, base de conhecimento e importações, telas que só o admin vê.
-- Leitura continua para a org inteira; escrita passa a exigir admin, igual à interface.
CREATE OR REPLACE FUNCTION public.org_admin(_org UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_belongs_to_org(_org) AND public.has_role(auth.uid(), 'admin'::app_role);
$$;

DROP POLICY IF EXISTS "org_members_all" ON public.ai_messaging_config;
DROP POLICY IF EXISTS "ai_messaging_config_select" ON public.ai_messaging_config;
CREATE POLICY "ai_messaging_config_select" ON public.ai_messaging_config FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "ai_messaging_config_admin_insert" ON public.ai_messaging_config;
CREATE POLICY "ai_messaging_config_admin_insert" ON public.ai_messaging_config FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "ai_messaging_config_admin_update" ON public.ai_messaging_config;
CREATE POLICY "ai_messaging_config_admin_update" ON public.ai_messaging_config FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "ai_messaging_config_admin_delete" ON public.ai_messaging_config;
CREATE POLICY "ai_messaging_config_admin_delete" ON public.ai_messaging_config FOR DELETE TO authenticated USING (public.org_admin(org_id));

DROP POLICY IF EXISTS "org_members_all" ON public.capture_forms;
DROP POLICY IF EXISTS "capture_forms_select" ON public.capture_forms;
CREATE POLICY "capture_forms_select" ON public.capture_forms FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "capture_forms_admin_insert" ON public.capture_forms;
CREATE POLICY "capture_forms_admin_insert" ON public.capture_forms FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "capture_forms_admin_update" ON public.capture_forms;
CREATE POLICY "capture_forms_admin_update" ON public.capture_forms FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "capture_forms_admin_delete" ON public.capture_forms;
CREATE POLICY "capture_forms_admin_delete" ON public.capture_forms FOR DELETE TO authenticated USING (public.org_admin(org_id));

DROP POLICY IF EXISTS "email_settings_org" ON public.email_settings;
DROP POLICY IF EXISTS "email_settings_select" ON public.email_settings;
CREATE POLICY "email_settings_select" ON public.email_settings FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "email_settings_admin_insert" ON public.email_settings;
CREATE POLICY "email_settings_admin_insert" ON public.email_settings FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "email_settings_admin_update" ON public.email_settings;
CREATE POLICY "email_settings_admin_update" ON public.email_settings FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "email_settings_admin_delete" ON public.email_settings;
CREATE POLICY "email_settings_admin_delete" ON public.email_settings FOR DELETE TO authenticated USING (public.org_admin(org_id));

DROP POLICY IF EXISTS "knowledge_documents_org" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_select" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_select" ON public.knowledge_documents FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "knowledge_documents_admin_insert" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_admin_insert" ON public.knowledge_documents FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "knowledge_documents_admin_update" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_admin_update" ON public.knowledge_documents FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "knowledge_documents_admin_delete" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_admin_delete" ON public.knowledge_documents FOR DELETE TO authenticated USING (public.org_admin(org_id));

DROP POLICY IF EXISTS "knowledge_facts_org" ON public.knowledge_facts;
DROP POLICY IF EXISTS "knowledge_facts_select" ON public.knowledge_facts;
CREATE POLICY "knowledge_facts_select" ON public.knowledge_facts FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "knowledge_facts_admin_insert" ON public.knowledge_facts;
CREATE POLICY "knowledge_facts_admin_insert" ON public.knowledge_facts FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "knowledge_facts_admin_update" ON public.knowledge_facts;
CREATE POLICY "knowledge_facts_admin_update" ON public.knowledge_facts FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "knowledge_facts_admin_delete" ON public.knowledge_facts;
CREATE POLICY "knowledge_facts_admin_delete" ON public.knowledge_facts FOR DELETE TO authenticated USING (public.org_admin(org_id));

DROP POLICY IF EXISTS "org_members_all" ON public.ai_knowledge_faqs;
DROP POLICY IF EXISTS "ai_knowledge_faqs_select" ON public.ai_knowledge_faqs;
CREATE POLICY "ai_knowledge_faqs_select" ON public.ai_knowledge_faqs FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "ai_knowledge_faqs_admin_insert" ON public.ai_knowledge_faqs;
CREATE POLICY "ai_knowledge_faqs_admin_insert" ON public.ai_knowledge_faqs FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "ai_knowledge_faqs_admin_update" ON public.ai_knowledge_faqs;
CREATE POLICY "ai_knowledge_faqs_admin_update" ON public.ai_knowledge_faqs FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "ai_knowledge_faqs_admin_delete" ON public.ai_knowledge_faqs;
CREATE POLICY "ai_knowledge_faqs_admin_delete" ON public.ai_knowledge_faqs FOR DELETE TO authenticated USING (public.org_admin(org_id));

DROP POLICY IF EXISTS "org_members_all" ON public.ai_knowledge_objections;
DROP POLICY IF EXISTS "ai_knowledge_objections_select" ON public.ai_knowledge_objections;
CREATE POLICY "ai_knowledge_objections_select" ON public.ai_knowledge_objections FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "ai_knowledge_objections_admin_insert" ON public.ai_knowledge_objections;
CREATE POLICY "ai_knowledge_objections_admin_insert" ON public.ai_knowledge_objections FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "ai_knowledge_objections_admin_update" ON public.ai_knowledge_objections;
CREATE POLICY "ai_knowledge_objections_admin_update" ON public.ai_knowledge_objections FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "ai_knowledge_objections_admin_delete" ON public.ai_knowledge_objections;
CREATE POLICY "ai_knowledge_objections_admin_delete" ON public.ai_knowledge_objections FOR DELETE TO authenticated USING (public.org_admin(org_id));

DROP POLICY IF EXISTS "unanswered_questions_org" ON public.unanswered_questions;
DROP POLICY IF EXISTS "unanswered_questions_select" ON public.unanswered_questions;
CREATE POLICY "unanswered_questions_select" ON public.unanswered_questions FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "unanswered_questions_admin_insert" ON public.unanswered_questions;
CREATE POLICY "unanswered_questions_admin_insert" ON public.unanswered_questions FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "unanswered_questions_admin_update" ON public.unanswered_questions;
CREATE POLICY "unanswered_questions_admin_update" ON public.unanswered_questions FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "unanswered_questions_admin_delete" ON public.unanswered_questions;
CREATE POLICY "unanswered_questions_admin_delete" ON public.unanswered_questions FOR DELETE TO authenticated USING (public.org_admin(org_id));

DROP POLICY IF EXISTS "imports_org" ON public.imports;
DROP POLICY IF EXISTS "imports_select" ON public.imports;
CREATE POLICY "imports_select" ON public.imports FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "imports_admin_insert" ON public.imports;
CREATE POLICY "imports_admin_insert" ON public.imports FOR INSERT TO authenticated WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "imports_admin_update" ON public.imports;
CREATE POLICY "imports_admin_update" ON public.imports FOR UPDATE TO authenticated USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));
DROP POLICY IF EXISTS "imports_admin_delete" ON public.imports;
CREATE POLICY "imports_admin_delete" ON public.imports FOR DELETE TO authenticated USING (public.org_admin(org_id));
