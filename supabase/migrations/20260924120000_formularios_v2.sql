-- Sprint 12 B3: formulários com embed, UTM, campos novos e regras condicionais (24/09/2026).
--
-- capture_forms.fields continua JSONB: cada campo ganha type novo (select, radio,
-- checkbox, number, date, hidden), options, help, value e show_when. Aqui
-- entram só as colunas de formulário e a contagem de envios.
ALTER TABLE public.capture_forms
  ADD COLUMN IF NOT EXISTS source_default TEXT NOT NULL DEFAULT 'capture_form',
  ADD COLUMN IF NOT EXISTS success_message TEXT,
  ADD COLUMN IF NOT EXISTS redirect_url TEXT,
  ADD COLUMN IF NOT EXISTS consent_text TEXT,
  ADD COLUMN IF NOT EXISTS theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submissions_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_submission_at TIMESTAMPTZ;

-- Envios ficam em tracking_events (event_type = 'form_submitted', meta.form_id).
CREATE INDEX IF NOT EXISTS idx_tracking_events_form
  ON public.tracking_events (org_id, ((meta ->> 'form_id')), created_at)
  WHERE event_type = 'form_submitted';

-- Contagem de envios por formulário (chamada pela function submit-capture-form).
CREATE OR REPLACE FUNCTION public.registrar_envio_formulario(p_form UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.capture_forms
  SET submissions_count = submissions_count + 1, last_submission_at = now()
  WHERE id = p_form
$$;
REVOKE ALL ON FUNCTION public.registrar_envio_formulario(UUID) FROM PUBLIC, anon, authenticated;
