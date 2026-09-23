-- Sprint 12 B1: e-mail de sistema com Resend (24/09/2026).
--
--  1. email_settings: provedor (resend|gmail), remetente, resposta, domínio
--     verificado e api_base (só para o hard smoke apontar a sandbox).
--  2. emails.provider: por onde cada e-mail saiu.
--  3. Sequências de e-mail ganham last_sent_at e passam a ser processadas
--     pelo sequence-dispatcher (antes as inscrições existiam sem ninguém enviar).
--  4. Cron do sequence-dispatcher, também no garantir_infra_do_projeto (remix).

CREATE TABLE IF NOT EXISTS public.email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail' CHECK (provider IN ('resend', 'gmail')),
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  domain_verified BOOLEAN NOT NULL DEFAULT false,
  api_base TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_settings_org" ON public.email_settings;
CREATE POLICY "email_settings_org" ON public.email_settings
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));

ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'gmail';

ALTER TABLE public.email_sequence_enrollments ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_email_sequence_enrollments_active
  ON public.email_sequence_enrollments (org_id, enrolled_at) WHERE status = 'active';

SELECT public.agendar_dispatcher('sequence-dispatch', '*/15 * * * *', 'sequence-dispatcher');

-- Remix: o job entra na lista que garantir_infra_do_projeto() recria.
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
      ('sequence-dispatch', '*/15 * * * *', 'sequence-dispatcher')
    ) AS j(nome, quando, fn)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job.nome) THEN
      PERFORM public.agendar_dispatcher(v_job.nome, v_job.quando, v_job.fn);
      v_criado := v_criado || v_job.nome::text;
    END IF;
  END LOOP;

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

-- Disparo manual (botão e hard smoke) reconhece o dispatcher novo.
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
    'sequence-dispatcher'
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
