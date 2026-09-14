-- Sprint 11, Fase 1: simulador de integrações para o hard smoke test.
--
-- O hard smoke precisa provar que cada integração funciona sem ter acesso à
-- ferramenta real. A function integration-sandbox faz dois papéis: finge ser um
-- servidor Evolution (server_url é configurável por instância) e recebe como
-- destino de webhook de saída (ERP e, na Fase 2, os webhooks genéricos). Tudo
-- que chega nela fica gravado aqui, e o teste lê para conferir o que o CRM mandou.
--
-- Uma sessão é criada pelo próprio teste (admin da org), vale 2 horas e é
-- identificada por um token na URL. Sem sessão válida a function responde 404
-- e não grava nada.

CREATE TABLE IF NOT EXISTS public.integration_sandbox_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  label text,
  -- Status devolvido quando a sandbox atua como destino de webhook: o teste muda
  -- para 500 para provar nova tentativa e reenvio.
  response_status integer NOT NULL DEFAULT 200,
  -- URL gravada por /webhook/set (Evolution simulado) e devolvida no /webhook/find.
  webhook_url text,
  webhook_events jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_sandbox_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.integration_sandbox_sessions(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  method text NOT NULL,
  path text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  body jsonb,
  raw_body text,
  response_status integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_sandbox_captures_session_idx
  ON public.integration_sandbox_captures (session_id, created_at);

ALTER TABLE public.integration_sandbox_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sandbox_captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sandbox_sessions_admin ON public.integration_sandbox_sessions;
CREATE POLICY sandbox_sessions_admin ON public.integration_sandbox_sessions
  FOR ALL
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

-- Capturas são escritas só pela function (service role); o admin lê e apaga.
DROP POLICY IF EXISTS sandbox_captures_admin_select ON public.integration_sandbox_captures;
CREATE POLICY sandbox_captures_admin_select ON public.integration_sandbox_captures
  FOR SELECT
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS sandbox_captures_admin_delete ON public.integration_sandbox_captures;
CREATE POLICY sandbox_captures_admin_delete ON public.integration_sandbox_captures
  FOR DELETE
  USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------------
-- Rodar um dispatcher agora, sem esperar o cron.
-- ---------------------------------------------------------------------------
-- O follow-up roda a cada 15 min e as mensagens agendadas a cada 5: esperar o
-- cron deixaria o teste lento e frágil. Os dispatchers varrem todas as orgs e
-- só fazem o que já está vencido, então adiantar uma execução é inofensivo.
-- Restrito a admin e a uma lista fechada de functions.
CREATE OR REPLACE FUNCTION public.executar_dispatcher_agora(p_function text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;
  IF p_function NOT IN (
    'automation-dispatcher', 'erp-outbound', 'followup-dispatcher',
    'nps-dispatcher', 'scheduled-message-dispatcher'
  ) THEN
    RAISE EXCEPTION 'Dispatcher desconhecido: %', p_function;
  END IF;

  RETURN net.http_post(
    url := 'https://tvwhiyojgtbuwtuohdes.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.internal_cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.executar_dispatcher_agora(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.executar_dispatcher_agora(text) TO authenticated;
