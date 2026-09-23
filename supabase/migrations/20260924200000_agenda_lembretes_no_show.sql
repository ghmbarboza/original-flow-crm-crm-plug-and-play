-- Sprint 12 B11: agenda nativa, lembrete e no-show (24/09/2026).
--
-- appointments é a fonte da verdade das reuniões (IA, manual e Cal.com). O
-- calendário externo (Nylas) só espelha: criar/remarcar/cancelar aqui manda o
-- evento para lá. A disponibilidade combina a tabela com o free/busy do dono
-- quando ele tem calendário conectado. Política de agenda por org, auditoria
-- das ações da IA com evidência literal e cron de lembrete/no-show.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Reuniões ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  location TEXT,
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ia', 'manual', 'calcom')),
  external_event_id TEXT,
  calendar_sync_status TEXT NOT NULL DEFAULT 'none' CHECK (calendar_sync_status IN ('none', 'pending', 'synced', 'error')),
  calendar_sync_error TEXT,
  reminder_sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  no_show_marked_at TIMESTAMPTZ,
  cancel_reason TEXT,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointments_periodo CHECK (ends_at > starts_at),
  -- O mesmo dono não tem duas reuniões vivas no mesmo horário.
  CONSTRAINT appointments_sem_sobreposicao EXCLUDE USING gist (
    owner_id WITH =, tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('scheduled', 'confirmed') AND owner_id IS NOT NULL),
  -- Reuniões sem dono ("agenda da empresa") também não se sobrepõem entre si.
  CONSTRAINT appointments_sem_sobreposicao_org EXCLUDE USING gist (
    org_id WITH =, tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('scheduled', 'confirmed') AND owner_id IS NULL)
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments_org" ON public.appointments;
CREATE POLICY "appointments_org" ON public.appointments
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS appointments_org_inicio_idx ON public.appointments (org_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_contato_idx ON public.appointments (contact_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_lembrete_idx ON public.appointments (starts_at) WHERE status IN ('scheduled', 'confirmed');

-- Calendário externo por usuário -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'nylas' CHECK (provider IN ('nylas')),
  grant_id TEXT NOT NULL,
  grant_provider TEXT,
  account_email TEXT,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'disconnected')),
  sync_enabled BOOLEAN NOT NULL DEFAULT true,
  create_meet BOOLEAN NOT NULL DEFAULT true,
  api_base TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar_integrations_read" ON public.calendar_integrations;
DROP POLICY IF EXISTS "calendar_integrations_own" ON public.calendar_integrations;
-- Cada um lê só a própria conexão (grant, e-mail); admin enxerga as da org.
CREATE POLICY "calendar_integrations_read" ON public.calendar_integrations
  FOR SELECT USING (user_id = auth.uid() OR (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "calendar_integrations_own" ON public.calendar_integrations
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.calendar_oauth_states (
  state TEXT PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  app_origin TEXT,
  api_base TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;

-- Política de agenda por org --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduling_policies (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  ai_enabled BOOLEAN NOT NULL DEFAULT false,
  default_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (default_duration_minutes BETWEEN 15 AND 240),
  buffer_minutes INTEGER NOT NULL DEFAULT 15 CHECK (buffer_minutes BETWEEN 0 AND 120),
  min_notice_minutes INTEGER NOT NULL DEFAULT 120 CHECK (min_notice_minutes BETWEEN 0 AND 10080),
  max_days_ahead INTEGER NOT NULL DEFAULT 60 CHECK (max_days_ahead BETWEEN 1 AND 365),
  weekdays INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  require_literal_confirmation BOOLEAN NOT NULL DEFAULT true,
  default_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reminder_minutes_before INTEGER NOT NULL DEFAULT 1440 CHECK (reminder_minutes_before BETWEEN 0 AND 10080),
  reminder_text TEXT NOT NULL DEFAULT 'Oi {{contact.first_name}}! Passando para lembrar da nossa reunião "{{appointment.title}}" em {{appointment.when}}. Responda "confirmo" para confirmar ou me avise se precisar remarcar.',
  reminder_template_name TEXT,
  no_show_after_minutes INTEGER NOT NULL DEFAULT 15 CHECK (no_show_after_minutes BETWEEN 5 AND 240),
  no_show_text TEXT NOT NULL DEFAULT 'Oi {{contact.first_name}}, não conseguimos nos falar em {{appointment.when}}. Quer remarcar? Me diga um dia e horário que funcionem para você.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduling_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheduling_policies_read" ON public.scheduling_policies;
DROP POLICY IF EXISTS "scheduling_policies_admin" ON public.scheduling_policies;
CREATE POLICY "scheduling_policies_read" ON public.scheduling_policies
  FOR SELECT USING (user_belongs_to_org(org_id));
CREATE POLICY "scheduling_policies_admin" ON public.scheduling_policies
  FOR ALL USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

-- Auditoria das ações da IA ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_action_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  source_message_id UUID,
  action_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'refused')),
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (org_id, idempotency_key)
);
ALTER TABLE public.agent_action_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_action_runs_read" ON public.agent_action_runs;
CREATE POLICY "agent_action_runs_read" ON public.agent_action_runs
  FOR SELECT USING (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS agent_action_runs_conv_idx ON public.agent_action_runs (conversation_id, started_at DESC);

-- Reunião vira atividade 'meeting' na linha do tempo (criada e mantida por trigger).
CREATE OR REPLACE FUNCTION public.tg_appointment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo TEXT;
  v_id UUID;
BEGIN
  NEW.updated_at := now();
  v_titulo := CASE NEW.status
    WHEN 'cancelled' THEN 'Reunião cancelada: ' || NEW.title
    WHEN 'no_show' THEN 'Não compareceu: ' || NEW.title
    WHEN 'completed' THEN 'Reunião realizada: ' || NEW.title
    ELSE 'Reunião: ' || NEW.title END;
  IF TG_OP = 'INSERT' OR NEW.activity_id IS NULL THEN
    INSERT INTO public.activities (org_id, type, title, body, contact_id, deal_id, user_id, due_date, completed_at)
    VALUES (NEW.org_id, 'meeting', v_titulo, NEW.description, NEW.contact_id, NEW.deal_id, NEW.owner_id, NEW.starts_at,
            CASE WHEN NEW.status IN ('completed', 'no_show', 'cancelled') THEN now() ELSE NULL END)
    RETURNING id INTO v_id;
    NEW.activity_id := v_id;
  ELSE
    UPDATE public.activities
       SET title = v_titulo, body = NEW.description, contact_id = NEW.contact_id, deal_id = NEW.deal_id, user_id = NEW.owner_id,
           due_date = NEW.starts_at,
           completed_at = CASE WHEN NEW.status IN ('completed', 'no_show', 'cancelled') THEN coalesce(completed_at, now()) ELSE NULL END
     WHERE id = NEW.activity_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_appointment_activity ON public.appointments;
CREATE TRIGGER tg_appointment_activity BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_appointment_activity();

-- Avisos ao dono e gatilhos de automação -----------------------------------------
CREATE OR REPLACE FUNCTION public.tg_appointment_eventos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quando TEXT;
BEGIN
  v_quando := to_char(NEW.starts_at AT TIME ZONE NEW.timezone, 'DD/MM "às" HH24:MI');
  IF TG_OP = 'INSERT' AND NEW.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    PERFORM create_notification(NEW.org_id, NEW.owner_id, 'reuniao_agendada',
      'Reunião agendada: ' || NEW.title, 'Marcada para ' || v_quando || CASE NEW.source WHEN 'ia' THEN ' pela IA' WHEN 'calcom' THEN ' pelo Cal.com' ELSE '' END || '.',
      'appointment', NEW.id);
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM enqueue_automations(NEW.org_id, 'appointment_scheduled',
      jsonb_build_object('id', NEW.id, 'contact_id', NEW.contact_id, 'deal_id', NEW.deal_id, 'starts_at', NEW.starts_at, 'source', NEW.source));
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
    IF NEW.owner_id IS NOT NULL THEN
      PERFORM create_notification(NEW.org_id, NEW.owner_id, 'reuniao_no_show',
        'Não compareceu: ' || NEW.title, 'O contato não apareceu na reunião de ' || v_quando || '.', 'appointment', NEW.id);
    END IF;
    PERFORM enqueue_automations(NEW.org_id, 'appointment_no_show',
      jsonb_build_object('id', NEW.id, 'contact_id', NEW.contact_id, 'deal_id', NEW.deal_id, 'starts_at', NEW.starts_at));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_appointment_eventos ON public.appointments;
CREATE TRIGGER tg_appointment_eventos AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_appointment_eventos();

-- Cron do dispatcher (lembrete e no-show a cada 5 min), remix e disparo manual.
SELECT public.agendar_dispatcher('appointment-dispatch', '*/5 * * * *', 'appointment-dispatcher');

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
      ('appointment-dispatch', '*/5 * * * *', 'appointment-dispatcher')
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
  FOREACH v_tabela IN ARRAY ARRAY['contacts', 'deals', 'notifications', 'conversations', 'conversation_messages', 'appointments'] LOOP
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
  IF p_function NOT IN ('automation-dispatcher', 'erp-outbound', 'followup-dispatcher', 'nps-dispatcher', 'scheduled-message-dispatcher', 'webhook-dispatcher', 'sequence-dispatcher', 'notification-dispatcher', 'appointment-dispatcher') THEN
    RAISE EXCEPTION 'Dispatcher desconhecido: %', p_function;
  END IF;
  v_req := public.chamar_function(p_function, 60000);
  IF v_req IS NULL THEN RAISE EXCEPTION 'URL do projeto ainda não registrada'; END IF;
  RETURN v_req;
END;
$fn$;

-- Realtime da agenda (a tela acompanha mudanças feitas pela IA e pelo cron).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'appointments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;
