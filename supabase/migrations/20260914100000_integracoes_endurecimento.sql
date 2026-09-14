-- Sprint 11, Fase 0 — endurecimento das integrações.
--
-- Achados da varredura de 14/09 que impactariam a entrega:
--  1. Nenhuma function tem verify_jwt no ar (a Lovable publica todas com
--     verify_jwt=false), então os dispatchers e a ai-reply estavam abertos.
--     Os crons passam a mandar um segredo interno guardado no Vault, e as
--     functions conferem contra o mesmo Vault. Não depende de secret de
--     ambiente (que só dá para cadastrar pelo agente da Lovable).
--  2. automation-dispatcher nunca teve agendamento: 2.748 execuções paradas
--     na fila, todas de automações "Automação E2E" que o teardown não apagava.
--  3. Webhooks de entrada sem prova de origem: Evolution (só instance_name),
--     Meta (POST sem assinatura, GET dependendo de secret de ambiente) e
--     Cal.com (secret de ambiente, que nunca existiu). Cada integração ganha o
--     seu segredo por organização, gerado aqui.

-- ---------------------------------------------------------------------------
-- 1. Segredo interno dos agendamentos
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_cron_secret') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'internal_cron_secret',
      'Header x-cron-secret que os agendamentos mandam para as functions'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.internal_cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.internal_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_cron_secret() TO service_role;

-- Reagenda um dispatcher mandando o segredo. O header é montado na hora de
-- cada execução (não fica gravado no texto do job).
CREATE OR REPLACE FUNCTION public.agendar_dispatcher(p_job text, p_schedule text, p_function text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM cron.unschedule(p_job) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = p_job);
  PERFORM cron.schedule(
    p_job,
    p_schedule,
    format(
      $cmd$SELECT net.http_post(
        url := 'https://tvwhiyojgtbuwtuohdes.supabase.co/functions/v1/%s',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.internal_cron_secret()),
        body := '{}'::jsonb
      )$cmd$,
      p_function
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_dispatcher(text, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fila de automações: descarta o lixo de teste e liga o agendamento
-- ---------------------------------------------------------------------------
DELETE FROM public.automation_logs
 WHERE automation_id IN (SELECT id FROM public.automations WHERE name LIKE 'Automação E2E%');
DELETE FROM public.automations WHERE name LIKE 'Automação E2E%';

SELECT public.agendar_dispatcher('erp-outbound-dispatch', '* * * * *', 'erp-outbound');
SELECT public.agendar_dispatcher('nps-dispatch', '* * * * *', 'nps-dispatcher');
SELECT public.agendar_dispatcher('followup-dispatch', '*/15 * * * *', 'followup-dispatcher');
SELECT public.agendar_dispatcher('scheduled-message-dispatch', '*/5 * * * *', 'scheduled-message-dispatcher');
SELECT public.agendar_dispatcher('automation-dispatch', '* * * * *', 'automation-dispatcher');

-- ---------------------------------------------------------------------------
-- 3. Segredos de webhook por organização
-- ---------------------------------------------------------------------------
-- Evolution: vai na query string da URL cadastrada no servidor. O default é
-- volátil, então cada linha existente recebe um token próprio.
ALTER TABLE public.evolution_configs
  ADD COLUMN IF NOT EXISTS webhook_token text NOT NULL
  DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- Meta: App Secret assina o POST (X-Hub-Signature-256); o verify token do GET
-- passa a ser por organização em vez de um secret de ambiente único.
ALTER TABLE public.meta_configs
  ADD COLUMN IF NOT EXISTS app_secret text,
  ADD COLUMN IF NOT EXISTS webhook_verify_token text NOT NULL
  DEFAULT replace(gen_random_uuid()::text, '-', '');
