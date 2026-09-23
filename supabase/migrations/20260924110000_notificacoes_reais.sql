-- Sprint 12 B2: notificações reais (24/09/2026).
--
--  1. notification_templates: texto de cada evento por org (no app, e-mail e
--     WhatsApp), com padrão em SQL quando a org não personalizou.
--  2. notification_deliveries: fila de entrega por e-mail e WhatsApp, lida pelo
--     notification-dispatcher (cron de 1 min). Só entra quando a preferência do
--     usuário para o canal está ligada.
--  3. create_notification renderiza o modelo e enfileira as entregas.
--  4. Eventos novos: negocio_atribuido, lead_atribuido, conversa_atribuida
--     (troca de dono) e tarefa_vencendo (cron de hora em hora).
--  5. app_url no Vault (origem do app registrada pelo ensure-auth-trigger), para
--     os links dos e-mails e das mensagens.

-- 1. Modelos --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  email_subject TEXT NOT NULL,
  email_html TEXT NOT NULL,
  whatsapp_text TEXT NOT NULL,
  whatsapp_template_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, event_type)
);
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_templates_org" ON public.notification_templates;
CREATE POLICY "notification_templates_org" ON public.notification_templates
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));

-- Padrão de cada evento quando a org não personalizou. {{title}} e {{body}} são o
-- texto que o produtor do evento montou; {{user.first_name}} e {{link}} vêm da entrega.
CREATE OR REPLACE FUNCTION public.notification_template_padrao(p_event TEXT)
RETURNS TABLE (title_template TEXT, body_template TEXT, email_subject TEXT, email_html TEXT, whatsapp_text TEXT)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    '{{title}}'::text,
    '{{body}}'::text,
    '{{title}}'::text,
    '<p>Olá, {{user.first_name}}.</p><p>{{body}}</p><p><a href="{{link}}">Abrir no CRM</a></p>'::text,
    ('*{{title}}*' || E'\n' || '{{body}}' || E'\n' || '{{link}}')::text
$$;

-- Substitui {{chave}} pelos valores de um jsonb plano ("user.first_name" é uma chave).
CREATE OR REPLACE FUNCTION public.renderizar_modelo(p_template TEXT, p_vars JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_saida TEXT := COALESCE(p_template, '');
  v_chave TEXT;
  v_valor TEXT;
BEGIN
  FOR v_chave, v_valor IN SELECT key, value #>> '{}' FROM jsonb_each(COALESCE(p_vars, '{}'::jsonb)) LOOP
    v_saida := replace(v_saida, '{{' || v_chave || '}}', COALESCE(v_valor, ''));
  END LOOP;
  RETURN v_saida;
END;
$$;

-- Lista os modelos da org (personalizado ou padrão) para os eventos informados.
CREATE OR REPLACE FUNCTION public.listar_modelos_notificacao(p_eventos TEXT[])
RETURNS TABLE (
  event_type TEXT, personalizado BOOLEAN, title_template TEXT, body_template TEXT,
  email_subject TEXT, email_html TEXT, whatsapp_text TEXT, whatsapp_template_name TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.evento,
    t.id IS NOT NULL,
    COALESCE(t.title_template, d.title_template),
    COALESCE(t.body_template, d.body_template),
    COALESCE(t.email_subject, d.email_subject),
    COALESCE(t.email_html, d.email_html),
    COALESCE(t.whatsapp_text, d.whatsapp_text),
    t.whatsapp_template_name
  FROM unnest(p_eventos) AS e(evento)
  CROSS JOIN LATERAL public.notification_template_padrao(e.evento) d
  LEFT JOIN public.notification_templates t
    ON t.event_type = e.evento AND t.org_id = public.current_org_id()
$$;

-- 2. Fila de entrega -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_deliveries_own" ON public.notification_deliveries;
CREATE POLICY "notification_deliveries_own" ON public.notification_deliveries
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending
  ON public.notification_deliveries (scheduled_at) WHERE status = 'pending';

-- 3. create_notification renderiza e enfileira -------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification(
  p_org uuid,
  p_user uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref RECORD;
  v_tpl RECORD;
  v_vars JSONB;
  v_titulo TEXT := p_title;
  v_corpo TEXT := p_body;
  v_id UUID;
  v_tem_pref BOOLEAN := false;
BEGIN
  IF p_user IS NULL OR p_org IS NULL THEN
    RETURN;
  END IF;

  SELECT channel_in_app, channel_email, channel_whatsapp INTO v_pref
  FROM notification_preferences
  WHERE user_id = p_user AND org_id = p_org AND event_type = p_event_type;
  v_tem_pref := FOUND;

  -- Sem preferência: só no app (o mesmo padrão de sempre).
  IF v_tem_pref AND v_pref.channel_in_app = false AND NOT COALESCE(v_pref.channel_email, false) AND NOT COALESCE(v_pref.channel_whatsapp, false) THEN
    RETURN;
  END IF;

  SELECT t.title_template, t.body_template INTO v_tpl
  FROM notification_templates t WHERE t.org_id = p_org AND t.event_type = p_event_type;
  IF FOUND THEN
    v_vars := jsonb_build_object(
      'title', COALESCE(p_title, ''),
      'body', COALESCE(p_body, ''),
      'user.first_name', COALESCE((SELECT split_part(full_name, ' ', 1) FROM profiles WHERE id = p_user), '')
    );
    v_titulo := NULLIF(renderizar_modelo(v_tpl.title_template, v_vars), '');
    v_corpo := NULLIF(renderizar_modelo(v_tpl.body_template, v_vars), '');
  END IF;

  IF NOT v_tem_pref OR v_pref.channel_in_app THEN
    INSERT INTO notifications (org_id, user_id, type, title, body, entity_type, entity_id)
    VALUES (p_org, p_user, p_event_type, COALESCE(v_titulo, p_title), v_corpo, p_entity_type, p_entity_id)
    RETURNING id INTO v_id;
  ELSE
    -- Preferência só de canal externo: a notificação existe (é a base da entrega) mas nasce lida.
    INSERT INTO notifications (org_id, user_id, type, title, body, entity_type, entity_id, is_read)
    VALUES (p_org, p_user, p_event_type, COALESCE(v_titulo, p_title), v_corpo, p_entity_type, p_entity_id, true)
    RETURNING id INTO v_id;
  END IF;

  IF v_tem_pref AND v_pref.channel_email THEN
    INSERT INTO notification_deliveries (org_id, notification_id, user_id, channel) VALUES (p_org, v_id, p_user, 'email');
  END IF;
  IF v_tem_pref AND v_pref.channel_whatsapp THEN
    INSERT INTO notification_deliveries (org_id, notification_id, user_id, channel) VALUES (p_org, v_id, p_user, 'whatsapp');
  END IF;
END;
$$;

-- 4. Eventos de atribuição e tarefa vencendo ----------------------------------------
CREATE OR REPLACE FUNCTION public.tg_notify_deal_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL OR NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = NEW.owner_id THEN
    RETURN NEW; -- pegou para si: não precisa avisar
  END IF;
  PERFORM create_notification(
    NEW.org_id, NEW.owner_id, 'negocio_atribuido',
    'Negócio atribuído a você',
    'O negócio "' || NEW.title || '" agora é seu.',
    'deal', NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_deal_assigned falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_deal_assigned ON public.deals;
CREATE TRIGGER trg_notify_deal_assigned
  AFTER INSERT OR UPDATE OF owner_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_deal_assigned();

CREATE OR REPLACE FUNCTION public.tg_notify_contact_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL OR NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = NEW.owner_id THEN
    RETURN NEW;
  END IF;
  PERFORM create_notification(
    NEW.org_id, NEW.owner_id, 'lead_atribuido',
    'Lead atribuído a você',
    trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')) || ' agora é seu contato.',
    'contact', NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_contact_assigned falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_contact_assigned ON public.contacts;
CREATE TRIGGER trg_notify_contact_assigned
  AFTER INSERT OR UPDATE OF owner_id ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_contact_assigned();

CREATE OR REPLACE FUNCTION public.tg_notify_conversation_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = NEW.assigned_to THEN
    RETURN NEW;
  END IF;
  PERFORM create_notification(
    NEW.org_id, NEW.assigned_to, 'conversa_atribuida',
    'Conversa atribuída a você',
    'A conversa com ' || COALESCE(NEW.channel_contact_name, NEW.phone_number, 'um contato') || ' agora é sua.',
    'conversation', NEW.id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_notify_conversation_assigned falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_conversation_assigned ON public.conversations;
CREATE TRIGGER trg_notify_conversation_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_conversation_assigned();

-- Tarefas que vencem nas próximas 24h, uma notificação por tarefa.
CREATE OR REPLACE FUNCTION public.notify_due_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_total INTEGER := 0;
BEGIN
  FOR r IN
    SELECT a.id, a.org_id, a.user_id, a.title, a.due_date
    FROM activities a
    WHERE a.type = 'task'
      AND a.completed_at IS NULL
      AND a.user_id IS NOT NULL
      AND a.due_date BETWEEN now() AND now() + interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.entity_id = a.id AND n.type = 'tarefa_vencendo'
      )
  LOOP
    PERFORM create_notification(
      r.org_id, r.user_id, 'tarefa_vencendo',
      'Tarefa vence em breve',
      '"' || r.title || '" vence ' || to_char(r.due_date AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.',
      'activity', r.id
    );
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_due_tasks() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('notify-due-tasks') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-due-tasks');
SELECT cron.schedule('notify-due-tasks', '0 * * * *', 'SELECT public.notify_due_tasks()');

-- 5. URL do app no Vault -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_app_url(p_url TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_url IS NULL OR p_url !~ '^https?://' OR p_url ~ 'localhost|127\.0\.0\.1' THEN
    RETURN;
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'app_url';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_url, 'app_url', 'Origem do app publicado, para links em e-mails e mensagens');
  ELSE
    PERFORM vault.update_secret(v_id, p_url);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_app_url(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_url()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url' LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.app_url() FROM PUBLIC, anon, authenticated;

-- 6. Cron do dispatcher e disparo manual --------------------------------------------
SELECT public.agendar_dispatcher('notification-dispatch', '* * * * *', 'notification-dispatcher');

-- Remix e disparo manual reconhecem o dispatcher e o cron novos.
CREATE OR REPLACE FUNCTION public.garantir_infra_do_projeto(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_criado text[] := '{}';
  v_job record;
  v_tabela text;
  v_modelos integer;
BEGIN
  PERFORM public.registrar_url_do_projeto(p_url);

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_cron_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'internal_cron_secret',
      'Header x-cron-secret que os agendamentos mandam para as functions'
    );
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
      ('notification-dispatch', '* * * * *', 'notification-dispatcher')
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

  FOREACH v_tabela IN ARRAY ARRAY['contacts', 'deals', 'notifications', 'conversations', 'conversation_messages'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_tabela
    ) THEN
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
SET search_path = public
AS $$
DECLARE
  v_req bigint;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;
  IF p_function NOT IN (
    'automation-dispatcher', 'erp-outbound', 'followup-dispatcher',
    'nps-dispatcher', 'scheduled-message-dispatcher', 'webhook-dispatcher',
    'sequence-dispatcher', 'notification-dispatcher'
  ) THEN
    RAISE EXCEPTION 'Dispatcher desconhecido: %', p_function;
  END IF;

  v_req := public.chamar_function(p_function, 60000);
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'URL do projeto ainda não registrada';
  END IF;
  RETURN v_req;
END;
$$;
