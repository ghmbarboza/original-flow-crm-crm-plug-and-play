-- Sprint 12 B13: voz (ligações por IA) (24/09/2026).
--
-- Porte da camada de voz da Nina Talks pelo caminho que funciona lá: integração
-- nativa ElevenLabs Conversational AI + Twilio. Por org: um agente de voz
-- (mesmo perfil da IA de texto), números Twilio importados no ElevenLabs,
-- ligações de entrada e saída com gravação, transcrição, resumo e
-- classificação, e campanhas de ligação. Credenciais (Twilio SID/token,
-- ElevenLabs) ficam no Vault por org.

-- Agente de voz (um por org) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voice_agents (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  elevenlabs_agent_id TEXT,
  voice_id TEXT,
  first_message TEXT NOT NULL DEFAULT 'Oi, aqui é {{agent_name}} da {{company_name}}. Tudo bem? Posso falar um minutinho?',
  language TEXT NOT NULL DEFAULT 'pt',
  max_duration_seconds INTEGER NOT NULL DEFAULT 600 CHECK (max_duration_seconds BETWEEN 60 AND 1800),
  prompt_extra TEXT,
  webhook_secret TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  api_base TEXT,
  synced_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.voice_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_agents_read" ON public.voice_agents;
DROP POLICY IF EXISTS "voice_agents_admin" ON public.voice_agents;
CREATE POLICY "voice_agents_read" ON public.voice_agents
  FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY "voice_agents_admin" ON public.voice_agents
  FOR ALL USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

-- O segredo dos webhooks e o api_base só as functions leem (service role): o
-- front enxerga e edita as demais colunas (grant por coluna, a RLS continua valendo).
REVOKE ALL ON public.voice_agents FROM authenticated;
GRANT SELECT (org_id, elevenlabs_agent_id, voice_id, first_message, language, max_duration_seconds, prompt_extra, synced_at, last_error, updated_at) ON public.voice_agents TO authenticated;
GRANT INSERT (org_id, voice_id, first_message, language, max_duration_seconds, prompt_extra) ON public.voice_agents TO authenticated;
GRANT UPDATE (voice_id, first_message, language, max_duration_seconds, prompt_extra, updated_at) ON public.voice_agents TO authenticated;
GRANT DELETE ON public.voice_agents TO authenticated;

-- Números ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  e164 TEXT NOT NULL UNIQUE,
  label TEXT,
  provider TEXT NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio')),
  twilio_sid TEXT,
  elevenlabs_phone_number_id TEXT,
  inbound_behavior TEXT NOT NULL DEFAULT 'ai_answer' CHECK (inbound_behavior IN ('ai_answer', 'forward_to_agent', 'voicemail')),
  forward_to TEXT,
  outbound_enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'released', 'error')),
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "phone_numbers_read" ON public.phone_numbers;
DROP POLICY IF EXISTS "phone_numbers_admin" ON public.phone_numbers;
CREATE POLICY "phone_numbers_read" ON public.phone_numbers
  FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY "phone_numbers_admin" ON public.phone_numbers
  FOR ALL USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

-- Ligações -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  phone_number_id UUID REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  campaign_id UUID,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'ringing', 'in_progress', 'completed', 'busy', 'failed', 'no_answer', 'canceled')),
  from_number TEXT,
  to_number TEXT,
  provider_call_sid TEXT UNIQUE,
  elevenlabs_conversation_id TEXT UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'sales' CHECK (purpose IN ('sales', 'reminder', 'no_show', 'campaign', 'inbound')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_path TEXT,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  classification JSONB,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calls_org" ON public.calls;
CREATE POLICY "calls_org" ON public.calls
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS calls_org_created_idx ON public.calls (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_contact_idx ON public.calls (contact_id, created_at DESC);

-- Campanhas de ligação ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voice_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number_id UUID REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL DEFAULT 'campaign',
  instruction TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'canceled')),
  max_concurrent INTEGER NOT NULL DEFAULT 2 CHECK (max_concurrent BETWEEN 1 AND 10),
  total INTEGER NOT NULL DEFAULT 0,
  placed INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.voice_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_campaigns_org" ON public.voice_campaigns;
CREATE POLICY "voice_campaigns_org" ON public.voice_campaigns
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));

CREATE TABLE IF NOT EXISTS public.voice_campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.voice_campaigns(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'placed', 'completed', 'failed', 'no_answer', 'canceled')),
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  dispatch_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  UNIQUE (campaign_id, contact_id)
);
ALTER TABLE public.voice_campaign_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_campaign_contacts_org" ON public.voice_campaign_contacts;
CREATE POLICY "voice_campaign_contacts_org" ON public.voice_campaign_contacts
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS voice_campaign_contacts_fila_idx ON public.voice_campaign_contacts (campaign_id, status, dispatch_after);

-- Gravações: bucket privado, leitura só por membros da org (primeira pasta = org_id).
INSERT INTO storage.buckets (id, name, public) VALUES ('voice-recordings', 'voice-recordings', false)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "voice_recordings_org_read" ON storage.objects;
CREATE POLICY "voice_recordings_org_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'voice-recordings' AND user_belongs_to_org(((storage.foldername(name))[1])::uuid));

-- Ligação encerrada vira atividade 'call' na linha do tempo (com resumo).
CREATE OR REPLACE FUNCTION public.tg_call_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_titulo TEXT;
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('completed', 'busy', 'failed', 'no_answer', 'canceled') AND NEW.activity_id IS NULL AND NEW.contact_id IS NOT NULL THEN
    v_titulo := CASE NEW.direction WHEN 'inbound' THEN 'Ligação recebida' ELSE 'Ligação feita pela IA' END
      || CASE NEW.status WHEN 'completed' THEN '' WHEN 'no_answer' THEN ' (não atendeu)' WHEN 'busy' THEN ' (ocupado)' ELSE ' (' || NEW.status || ')' END;
    INSERT INTO public.activities (org_id, type, title, body, contact_id, deal_id, user_id, due_date, completed_at)
    VALUES (NEW.org_id, 'call', v_titulo, NEW.summary, NEW.contact_id, NEW.deal_id, NEW.created_by, coalesce(NEW.started_at, NEW.created_at), now())
    RETURNING id INTO v_id;
    NEW.activity_id := v_id;
  ELSIF NEW.activity_id IS NOT NULL AND NEW.summary IS DISTINCT FROM OLD.summary THEN
    UPDATE public.activities SET body = NEW.summary WHERE id = NEW.activity_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_call_activity ON public.calls;
CREATE TRIGGER tg_call_activity BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.tg_call_activity();

-- Realtime da lista de ligações ("ao vivo") e cron das campanhas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;
SELECT public.agendar_dispatcher('voice-campaign-dispatch', '* * * * *', 'voice-campaign-dispatcher');

CREATE OR REPLACE FUNCTION public.garantir_infra_do_projeto(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $fn$
DECLARE
  v_criado text[] := '{}';
  v_job record;
  v_tabela text;
  v_modelos integer;
BEGIN
  PERFORM public.registrar_url_do_projeto(p_url);
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_cron_secret') THEN
    PERFORM vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'internal_cron_secret', 'Header x-cron-secret que os agendamentos mandam para as functions');
    v_criado := v_criado || 'internal_cron_secret'::text;
  END IF;
  FOR v_job IN
    SELECT * FROM (VALUES
      ('erp-outbound-dispatch', '* * * * *', 'erp-outbound'),
      ('nps-dispatch', '* * * * *', 'nps-dispatcher'),
      ('followup-dispatch', '*/15 * * * *', 'followup-dispatcher'),
      ('scheduled-message-dispatch', '*/5 * * * *', 'scheduled-message-dispatcher'),
      ('automation-dispatch', '* * * * *', 'automation-dispatcher'),
      ('webhook-dispatch', '* * * * *', 'webhook-dispatcher'),
      ('sequence-dispatch', '*/15 * * * *', 'sequence-dispatcher'),
      ('notification-dispatch', '* * * * *', 'notification-dispatcher'),
      ('appointment-dispatch', '*/5 * * * *', 'appointment-dispatcher'),
      ('voice-campaign-dispatch', '* * * * *', 'voice-campaign-dispatcher')
    ) AS j(nome, quando, fn)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job.nome) THEN
      PERFORM public.agendar_dispatcher(v_job.nome, v_job.quando, v_job.fn);
      v_criado := v_criado || v_job.nome::text;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-due-tasks') THEN
    PERFORM cron.schedule('notify-due-tasks', '0 * * * *', 'SELECT public.notify_due_tasks()');
    v_criado := v_criado || 'notify-due-tasks'::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-stale-conversations') THEN
    PERFORM cron.schedule('notify-stale-conversations', '*/5 * * * *', 'SELECT public.notify_stale_conversations()');
    v_criado := v_criado || 'notify-stale-conversations'::text;
  END IF;
  FOREACH v_tabela IN ARRAY ARRAY['contacts', 'deals', 'notifications', 'conversations', 'conversation_messages', 'appointments', 'calls'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_tabela) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabela);
      v_criado := v_criado || ('realtime:' || v_tabela)::text;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.library_templates) THEN
    v_modelos := public.semear_biblioteca_modelos();
    v_criado := v_criado || ('biblioteca:' || v_modelos)::text;
  END IF;
  RETURN jsonb_build_object('criado', to_jsonb(v_criado));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.executar_dispatcher_agora(p_function text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_req bigint;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501'; END IF;
  IF p_function NOT IN ('automation-dispatcher', 'erp-outbound', 'followup-dispatcher', 'nps-dispatcher', 'scheduled-message-dispatcher', 'webhook-dispatcher', 'sequence-dispatcher', 'notification-dispatcher', 'appointment-dispatcher', 'voice-campaign-dispatcher') THEN
    RAISE EXCEPTION 'Dispatcher desconhecido: %', p_function;
  END IF;
  v_req := public.chamar_function(p_function, 60000);
  IF v_req IS NULL THEN RAISE EXCEPTION 'URL do projeto ainda não registrada'; END IF;
  RETURN v_req;
END;
$fn$;

-- Contadores da campanha (chamado pelas functions com service role).
CREATE OR REPLACE FUNCTION public.incrementar_campanha_voz(p_campaign UUID, p_campo TEXT, p_quanto INTEGER DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_campo NOT IN ('placed', 'completed', 'failed') THEN RAISE EXCEPTION 'campo inválido'; END IF;
  EXECUTE format('UPDATE public.voice_campaigns SET %I = %I + $1, updated_at = now() WHERE id = $2', p_campo, p_campo) USING p_quanto, p_campaign;
END;
$$;
REVOKE ALL ON FUNCTION public.incrementar_campanha_voz(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.incrementar_campanha_voz(UUID, TEXT, INTEGER) TO service_role;
