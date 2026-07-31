-- Sprint 10A-3 — Mensagens programadas (avulsas e por etapa do pipeline).
--
-- O dispatcher (cron */5) busca status='pending' com scheduled_at vencido —
-- daí o índice parcial. O gatilho por etapa vive em pipeline_stages
-- (auto_message_template + delay): mover um deal para a etapa cria uma linha
-- aqui com pipeline_stage_id preenchido, para auditoria e cancelamento.

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'whatsapp',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at TIMESTAMPTZ,
  error_msg TEXT,
  created_by UUID REFERENCES auth.users(id),
  pipeline_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_messages_org" ON public.scheduled_messages;
CREATE POLICY "scheduled_messages_org" ON public.scheduled_messages
  FOR ALL USING (user_belongs_to_org(org_id));

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
  ON public.scheduled_messages(org_id, scheduled_at)
  WHERE status = 'pending';

-- Gatilho por etapa: mensagem automática ao deal entrar na etapa.
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS auto_message_template TEXT,
  ADD COLUMN IF NOT EXISTS auto_message_delay_hours INTEGER DEFAULT 0;
