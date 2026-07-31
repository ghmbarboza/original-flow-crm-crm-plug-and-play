-- Sprint 10B-4b — Fluxo do NPS automático.
--
-- A linha de nps_responses nasce no ENVIO (sent_at) com score nulo; a resposta
-- do lead preenche score/comment/responded_at via trigger; o agradecimento é
-- enviado pelo dispatcher na passada seguinte (thanked_at marca que já foi).
-- responded_at deixa de ter DEFAULT now() — "enviado" e "respondido" são
-- momentos diferentes e o relatório precisa distingui-los.
--
-- Aproveita para agendar os dispatchers por pg_cron + pg_net: além do novo
-- nps-dispatcher, followup-dispatcher e scheduled-message-dispatcher — ambos
-- existiam como function mas NUNCA tiveram agendamento em produção (só o
-- notify-stale-conversations estava no cron.job).

ALTER TABLE public.nps_responses
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS thanked_at TIMESTAMPTZ;

ALTER TABLE public.nps_responses
  ALTER COLUMN responded_at DROP DEFAULT,
  ALTER COLUMN responded_at DROP NOT NULL;

-- Envio pendente é procurado por conversa; resposta pendente idem.
CREATE INDEX IF NOT EXISTS idx_nps_responses_pending
  ON public.nps_responses(org_id, conversation_id)
  WHERE score IS NULL;

-- ---------------------------------------------------------------
-- Captura da resposta: mensagem inbound numa conversa com NPS enviado e sem
-- score. O primeiro número 0–10 vira o score; o resto do texto vira comment.
-- Trigger no banco pela mesma razão de sempre: cobre os três webhooks.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_nps_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending record;
  v_match text[];
  v_score integer;
  v_comment text;
BEGIN
  IF NEW.direction <> 'inbound' OR COALESCE(NEW.is_internal_note, false) OR NEW.content IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_pending
    FROM nps_responses
   WHERE conversation_id = NEW.conversation_id
     AND score IS NULL
   ORDER BY sent_at DESC
   LIMIT 1;
  IF v_pending.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Primeiro 10 ou dígito isolado da mensagem.
  v_match := regexp_match(NEW.content, '(?:^|[^0-9])(10|[0-9])(?:[^0-9]|$)');
  IF v_match IS NULL THEN
    RETURN NEW;
  END IF;
  v_score := v_match[1]::integer;

  -- O que sobra além do número vira comentário, se tiver conteúdo real.
  v_comment := btrim(regexp_replace(NEW.content, '(?:^|[^0-9])(10|[0-9])(?:[^0-9]|$)', ' '));
  IF length(v_comment) < 3 THEN
    v_comment := NULL;
  END IF;

  UPDATE nps_responses
     SET score = v_score,
         comment = v_comment,
         responded_at = now()
   WHERE id = v_pending.id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_nps_response ON public.conversation_messages;
CREATE TRIGGER trg_capture_nps_response
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.capture_nps_response();

-- ---------------------------------------------------------------
-- Agendamentos.
-- ---------------------------------------------------------------
SELECT cron.unschedule('nps-dispatch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nps-dispatch');
SELECT cron.schedule(
  'nps-dispatch',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tvwhiyojgtbuwtuohdes.supabase.co/functions/v1/nps-dispatcher',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('followup-dispatch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'followup-dispatch');
SELECT cron.schedule(
  'followup-dispatch',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tvwhiyojgtbuwtuohdes.supabase.co/functions/v1/followup-dispatcher',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('scheduled-message-dispatch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-message-dispatch');
SELECT cron.schedule(
  'scheduled-message-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tvwhiyojgtbuwtuohdes.supabase.co/functions/v1/scheduled-message-dispatcher',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
