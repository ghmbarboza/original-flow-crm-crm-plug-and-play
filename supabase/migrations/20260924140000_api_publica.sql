-- Sprint 12 B5: API pública com escopos (24/09/2026).
--
--  1. api_keys (tabela existia sem uso): escopos, limite por minuto, RLS e RPC
--     criar_chave_api (chave fcrm_live_..., só o hash fica no banco).
--  2. api_request_logs: toda chamada, para a aba API.
--  3. api_rate_limits + consumir_cota_api: janela de 1 minuto por chave.
--  4. Eventos de saída novos: message.sent, conversation.started,
--     conversation.handoff, deal.assigned (webhook-dispatcher).

-- 1. Chaves ---------------------------------------------------------------------
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER NOT NULL DEFAULT 120;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_keys_org_read" ON public.api_keys;
CREATE POLICY "api_keys_org_read" ON public.api_keys
  FOR SELECT USING (user_belongs_to_org(org_id));
DROP POLICY IF EXISTS "api_keys_admin_update" ON public.api_keys;
CREATE POLICY "api_keys_admin_update" ON public.api_keys
  FOR UPDATE USING (user_belongs_to_org(org_id) AND has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.criar_chave_api(p_name TEXT, p_scopes TEXT[], p_rate_limit INTEGER DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org UUID;
  v_chave TEXT;
  v_id UUID;
  v_escopo TEXT;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = auth.uid();
  IF v_org IS NULL THEN RAISE EXCEPTION 'Organização não encontrada'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Dê um nome para a chave (ex.: a ferramenta que vai usar)'; END IF;
  IF p_scopes IS NULL OR array_length(p_scopes, 1) IS NULL THEN RAISE EXCEPTION 'Escolha ao menos um escopo'; END IF;
  FOREACH v_escopo IN ARRAY p_scopes LOOP
    IF v_escopo NOT IN ('contacts:read','contacts:write','deals:read','deals:write','conversations:read','conversations:write',
                        'pipelines:read','activities:write','products:read','knowledge:read') THEN
      RAISE EXCEPTION 'Escopo desconhecido: %', v_escopo;
    END IF;
  END LOOP;

  v_chave := 'fcrm_live_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO api_keys (org_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute, created_by)
  VALUES (v_org, trim(p_name), left(v_chave, 18), encode(digest(v_chave, 'sha256'), 'hex'), p_scopes,
          GREATEST(10, LEAST(coalesce(p_rate_limit, 120), 3000)), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'key', v_chave);
END;
$$;
REVOKE ALL ON FUNCTION public.criar_chave_api(TEXT, TEXT[], INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_chave_api(TEXT, TEXT[], INTEGER) TO authenticated;

-- 2. Logs ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_request_logs_org_read" ON public.api_request_logs;
CREATE POLICY "api_request_logs_org_read" ON public.api_request_logs
  FOR SELECT USING (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS idx_api_request_logs_org ON public.api_request_logs (org_id, created_at DESC);

-- 3. Limite por minuto ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consumir_cota_api(p_key UUID, p_limite INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_janela TIMESTAMPTZ := date_trunc('minute', now());
  v_total INTEGER;
BEGIN
  INSERT INTO api_rate_limits (key_id, window_start, count) VALUES (p_key, v_janela, 1)
  ON CONFLICT (key_id, window_start) DO UPDATE SET count = api_rate_limits.count + 1
  RETURNING count INTO v_total;
  -- Limpeza oportunista das janelas velhas desta chave.
  DELETE FROM api_rate_limits WHERE key_id = p_key AND window_start < v_janela - interval '10 minutes';
  RETURN v_total <= p_limite;
END;
$$;
REVOKE ALL ON FUNCTION public.consumir_cota_api(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- 4. Eventos de saída novos -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.webhook_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
  v_evento TEXT;
BEGIN
  IF coalesce(NEW.is_demo, false) OR coalesce(NEW.is_internal_note, false) THEN
    RETURN NEW;
  END IF;
  v_evento := CASE WHEN NEW.direction = 'inbound' THEN 'message.received' ELSE 'message.sent' END;
  SELECT id, contact_id, channel, provider, phone_number INTO v_conv FROM conversations WHERE id = NEW.conversation_id;

  PERFORM enqueue_webhook_event(NEW.org_id, v_evento, jsonb_strip_nulls(jsonb_build_object(
    'message', jsonb_strip_nulls(jsonb_build_object(
      'id', NEW.id, 'type', NEW.type, 'content', NEW.content, 'media_url', NEW.media_url,
      'is_from_ai', NEW.is_from_ai, 'created_at', NEW.created_at
    )),
    'conversation', jsonb_build_object(
      'id', v_conv.id, 'channel', coalesce(v_conv.channel, 'whatsapp'), 'provider', v_conv.provider, 'phone', v_conv.phone_number
    ),
    'contact', CASE WHEN v_conv.contact_id IS NULL THEN NULL ELSE webhook_contato_json(v_conv.contact_id) END
  )));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.webhook_on_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento TEXT;
BEGIN
  IF coalesce(NEW.is_demo, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    v_evento := 'conversation.started';
  ELSIF NEW.status = 'human_takeover' AND OLD.status IS DISTINCT FROM 'human_takeover' THEN
    v_evento := 'conversation.handoff';
  ELSE
    RETURN NEW;
  END IF;
  PERFORM enqueue_webhook_event(NEW.org_id, v_evento, jsonb_strip_nulls(jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', NEW.id, 'channel', coalesce(NEW.channel, 'whatsapp'), 'provider', NEW.provider, 'phone', NEW.phone_number,
      'status', NEW.status, 'assigned_to', NEW.assigned_to, 'deal_id', NEW.deal_id
    ),
    'contact', CASE WHEN NEW.contact_id IS NULL THEN NULL ELSE webhook_contato_json(NEW.contact_id) END
  )));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_webhook_conversation ON public.conversations;
CREATE TRIGGER trg_webhook_conversation
  AFTER INSERT OR UPDATE OF status ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.webhook_on_conversation();

CREATE OR REPLACE FUNCTION public.webhook_on_deal_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.is_demo, false) OR NEW.owner_id IS NULL OR NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
    RETURN NEW;
  END IF;
  PERFORM enqueue_webhook_event(NEW.org_id, 'deal.assigned', jsonb_strip_nulls(jsonb_build_object(
    'deal', webhook_negocio_json(NEW.id),
    'owner', (SELECT jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email) FROM profiles p WHERE p.id = NEW.owner_id),
    'contact', CASE WHEN NEW.contact_id IS NULL THEN NULL ELSE webhook_contato_json(NEW.contact_id) END
  )));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_webhook_deal_assigned ON public.deals;
CREATE TRIGGER trg_webhook_deal_assigned
  AFTER UPDATE OF owner_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.webhook_on_deal_assigned();
