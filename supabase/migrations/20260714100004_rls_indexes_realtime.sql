-- =====================================================
-- FlowCRM 2.0 — Migration 4: RLS, policies, indexes, realtime e storage
--
-- ATENÇÃO: habilitar RLS sem criar policy nenhuma nega TODO acesso à tabela.
-- Por isso cada tabela abaixo ganha RLS *e* a policy correspondente na mesma
-- migration. Nenhuma tabela fica com RLS ligado e política ausente.
--
-- Modelo de acesso:
--   - Membros da org: acesso total às tabelas operacionais (user_belongs_to_org).
--   - Somente admin: credenciais e trilha de auditoria (audit_logs, api_keys,
--     meta_instances, evolution_instances, integration_configs).
--   - Somente o dono: notificações, preferências e tokens OAuth do próprio usuário.
--   - Anônimo: apenas leitura de formulários de captura ativos (rota pública /f/:slug).
--
-- O recorte por diretor/gerente/agente (profiles.crm_role) é aplicado na camada
-- de aplicação e será endurecido em policies próprias no Sprint 5, junto com a
-- tela de hierarquia. Nesta fundação, membro da org enxerga a org.
-- =====================================================

-- 1. Tabelas operacionais: todo membro da org ---------------------------
DO $$
DECLARE
  _t TEXT;
  _org_tables TEXT[] := ARRAY[
    'teams', 'pipelines', 'pipeline_stages', 'loss_reasons',
    'companies', 'contacts', 'tags', 'deals', 'products',
    'activities', 'custom_field_definitions', 'contact_groups',
    'emails', 'email_templates', 'email_sequences', 'email_sequence_steps',
    'email_sequence_enrollments', 'sales_goals', 'lead_scoring_rules',
    'lead_score_history', 'automations', 'automation_logs', 'capture_forms',
    'tracking_events', 'whatsapp_config', 'whatsapp_conversations',
    'whatsapp_messages', 'whatsapp_inbound_queue', 'whatsapp_ai_config',
    'ai_prompt_versions', 'ai_knowledge_faqs', 'ai_knowledge_objections',
    'followup_configs', 'followup_steps', 'followup_executions',
    'campaigns', 'campaign_recipients'
  ];
BEGIN
  FOREACH _t IN ARRAY _org_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _t);
    EXECUTE format('DROP POLICY IF EXISTS org_members_all ON public.%I', _t);
    EXECUTE format(
      'CREATE POLICY org_members_all ON public.%I FOR ALL TO authenticated
         USING (public.user_belongs_to_org(org_id))
         WITH CHECK (public.user_belongs_to_org(org_id))', _t);
  END LOOP;
END $$;

-- 2. Tabelas restritas a admin (credenciais e auditoria) ----------------
DO $$
DECLARE
  _t TEXT;
  _admin_tables TEXT[] := ARRAY[
    'audit_logs', 'api_keys', 'meta_instances', 'evolution_instances', 'integration_configs'
  ];
BEGIN
  FOREACH _t IN ARRAY _admin_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _t);
    EXECUTE format('DROP POLICY IF EXISTS org_admins_all ON public.%I', _t);
    EXECUTE format(
      'CREATE POLICY org_admins_all ON public.%I FOR ALL TO authenticated
         USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), ''admin''))
         WITH CHECK (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), ''admin''))', _t);
  END LOOP;
END $$;

-- audit_logs é append-only para quem escreve e imutável para todos:
-- a trilha nunca pode ser editada ou apagada pela aplicação, nem por admin.
DROP POLICY IF EXISTS org_admins_all ON public.audit_logs;
CREATE POLICY audit_admin_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY audit_member_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(org_id));

-- 3. Organizations: membros leem, admin edita --------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_members_read ON public.organizations
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(id));

CREATE POLICY org_admins_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.user_belongs_to_org(id) AND public.has_role(auth.uid(), 'admin'));

-- 4. Tabelas do próprio usuário ----------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_notifications ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.user_belongs_to_org(org_id));

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_notification_prefs ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.user_belongs_to_org(org_id));

-- Tokens de email/Google: o dono acessa os seus; ninguém mais, nem admin.
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_email_connection ON public.email_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.user_belongs_to_org(org_id));

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_google_token ON public.google_oauth_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 5. Tabelas de junção: herdam o acesso do pai -------------------------
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_members_via_team ON public.team_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND public.user_belongs_to_org(t.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND public.user_belongs_to_org(t.org_id)));

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_tags_via_contact ON public.contact_tags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND public.user_belongs_to_org(c.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_id AND public.user_belongs_to_org(c.org_id)));

ALTER TABLE public.deal_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_tags_via_deal ON public.deal_tags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND public.user_belongs_to_org(d.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND public.user_belongs_to_org(d.org_id)));

ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_members_via_group ON public.contact_group_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contact_groups g WHERE g.id = group_id AND public.user_belongs_to_org(g.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.contact_groups g WHERE g.id = group_id AND public.user_belongs_to_org(g.org_id)));

ALTER TABLE public.deal_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_products_via_deal ON public.deal_products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND public.user_belongs_to_org(d.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND public.user_belongs_to_org(d.org_id)));

-- 6. Formulário público de captura -------------------------------------
-- A rota /f/:slug é anônima: o visitante precisa ler os campos do formulário.
-- Só isso. A submissão passa por edge function; anon nunca escreve direto.
CREATE POLICY capture_forms_public_read ON public.capture_forms
  FOR SELECT TO anon
  USING (is_active = true);

-- 7. Realtime -----------------------------------------------------------
ALTER TABLE public.deals REPLICA IDENTITY FULL;
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
DECLARE
  _t TEXT;
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'deals', 'contacts', 'whatsapp_conversations', 'whatsapp_messages', 'notifications'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
    END IF;
  END LOOP;
END $$;

-- 8. Indexes ------------------------------------------------------------
CREATE INDEX idx_profiles_org ON public.profiles(org_id);
CREATE INDEX idx_contacts_org ON public.contacts(org_id);
CREATE INDEX idx_contacts_owner ON public.contacts(owner_id);
CREATE INDEX idx_contacts_phone ON public.contacts(org_id, whatsapp_phone);
CREATE INDEX idx_companies_org ON public.companies(org_id);
CREATE INDEX idx_deals_org ON public.deals(org_id);
CREATE INDEX idx_deals_stage ON public.deals(stage_id);
CREATE INDEX idx_deals_owner ON public.deals(owner_id);
CREATE INDEX idx_activities_org ON public.activities(org_id);
CREATE INDEX idx_activities_contact ON public.activities(contact_id);
CREATE INDEX idx_activities_deal ON public.activities(deal_id);
CREATE INDEX idx_wpp_conv_org ON public.whatsapp_conversations(org_id);
CREATE INDEX idx_wpp_conv_phone ON public.whatsapp_conversations(org_id, phone_number);
CREATE INDEX idx_wpp_conv_last ON public.whatsapp_conversations(org_id, last_message_at DESC);
CREATE INDEX idx_wpp_msg_conv ON public.whatsapp_messages(conversation_id, sent_at DESC);
-- Fila: a edge function busca pendentes vencidas; este é o índice do polling.
CREATE INDEX idx_wpp_queue_pending ON public.whatsapp_inbound_queue(org_id, status, process_after);
CREATE INDEX idx_followup_next ON public.followup_executions(status, next_attempt_at);
CREATE INDEX idx_notifications ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_audit_org ON public.audit_logs(org_id, created_at DESC);
CREATE INDEX idx_campaign_recipients ON public.campaign_recipients(campaign_id, status);

-- 9. Storage: mídia do WhatsApp ----------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "whatsapp media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'whatsapp-media');

CREATE POLICY "whatsapp media authenticated write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-media');
