ALTER TABLE public.ai_messaging_config
  ADD COLUMN IF NOT EXISTS voice_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_id text,
  ADD COLUMN IF NOT EXISTS voice_response_mode text NOT NULL DEFAULT 'reply_to_audio';

ALTER TABLE public.ai_messaging_config
  DROP CONSTRAINT IF EXISTS ai_messaging_config_voice_response_mode_check;

ALTER TABLE public.ai_messaging_config
  ADD CONSTRAINT ai_messaging_config_voice_response_mode_check
  CHECK (voice_response_mode IN ('reply_to_audio', 'always'));