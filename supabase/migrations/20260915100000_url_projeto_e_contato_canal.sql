-- Pendências da prontidão das integrações (15/09).
--
--  1. URL do projeto fixa nos agendamentos. Os crons e o executar_dispatcher_agora
--     tinham 'https://tvwhiyojgtbuwtuohdes.supabase.co' no texto: num remix os
--     dispatchers do cliente chamariam as functions do projeto original, com o
--     segredo interno do cliente no header. Agora a URL fica no Vault
--     ('project_url') e é lida na hora de cada execução. Quem grava é a function
--     check-user-active, com o SUPABASE_URL do próprio ambiente (o navegador não
--     escolhe o endereço), no primeiro login depois do deploy.
--  2. Contatos de canal sem telefone (Instagram, Messenger, Telegram...) sem
--     índice único: numa rajada cada invocação criava o seu.

-- ---------------------------------------------------------------------------
-- 1. URL do projeto
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.url_do_projeto()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.url_do_projeto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.url_do_projeto() TO service_role;

-- Só a service role grava, e só no formato de URL de projeto Supabase.
CREATE OR REPLACE FUNCTION public.registrar_url_do_projeto(p_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url text := rtrim(p_url, '/');
  v_id uuid;
  v_atual text;
BEGIN
  IF v_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' THEN
    RAISE EXCEPTION 'URL de projeto inválida: %', p_url;
  END IF;
  SELECT id, decrypted_secret INTO v_id, v_atual
    FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_url, 'project_url', 'Base das functions chamadas pelos agendamentos');
  ELSIF v_atual IS DISTINCT FROM v_url THEN
    PERFORM vault.update_secret(v_id, v_url);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_url_do_projeto(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_url_do_projeto(text) TO service_role;

-- Chama uma function do projeto com o segredo interno. Sem URL registrada
-- (projeto recém-remixado que ainda não teve login) não chama nada e deixa o
-- motivo no log do Postgres, em vez de mandar o segredo para outro projeto.
CREATE OR REPLACE FUNCTION public.chamar_function(p_function text, p_timeout_ms integer DEFAULT 5000)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text := public.url_do_projeto();
BEGIN
  IF v_base IS NULL THEN
    RAISE WARNING 'chamar_function(%): URL do projeto ainda não registrada (faça login no app uma vez)', p_function;
    RETURN NULL;
  END IF;
  RETURN net.http_post(
    url := v_base || '/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.internal_cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := p_timeout_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.chamar_function(text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agendar_dispatcher(p_job text, p_schedule text, p_function text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM cron.unschedule(p_job) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = p_job);
  PERFORM cron.schedule(p_job, p_schedule, format('SELECT public.chamar_function(%L)', p_function));
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_dispatcher(text, text, text) FROM PUBLIC, anon, authenticated;

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
    'nps-dispatcher', 'scheduled-message-dispatcher', 'webhook-dispatcher'
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

REVOKE ALL ON FUNCTION public.executar_dispatcher_agora(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.executar_dispatcher_agora(text) TO authenticated;

-- Reagenda todos: nenhum job fica com endereço no texto.
SELECT public.agendar_dispatcher('erp-outbound-dispatch', '* * * * *', 'erp-outbound');
SELECT public.agendar_dispatcher('nps-dispatch', '* * * * *', 'nps-dispatcher');
SELECT public.agendar_dispatcher('followup-dispatch', '*/15 * * * *', 'followup-dispatcher');
SELECT public.agendar_dispatcher('scheduled-message-dispatch', '*/5 * * * *', 'scheduled-message-dispatcher');
SELECT public.agendar_dispatcher('automation-dispatch', '* * * * *', 'automation-dispatcher');
SELECT public.agendar_dispatcher('webhook-dispatch', '* * * * *', 'webhook-dispatcher');

-- ---------------------------------------------------------------------------
-- 2. Um contato por identificador de canal dentro da organização
-- ---------------------------------------------------------------------------
-- WhatsApp fica de fora: já é único por telefone (uniq_contact_whatsapp_por_org).
-- Parcial pelo mesmo motivo daquele: contato mesclado guarda o identificador
-- para o histórico e não disputa com quem o absorveu.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contact_canal_por_org
  ON public.contacts (org_id, (custom_fields->>'channel'), (custom_fields->>'channel_contact_id'))
  WHERE custom_fields->>'channel_contact_id' IS NOT NULL
    AND custom_fields->>'channel' IS DISTINCT FROM 'whatsapp'
    AND merged_into_id IS NULL;
