-- Sprint 10B-4 — NPS automático ao encerrar conversa.
--
-- nps_configs é única por org (mensagem, delay, canais); nps_responses guarda
-- cada resposta com o score 0–10 e o agente da conversa no momento do envio.

CREATE TABLE IF NOT EXISTS public.nps_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT false,
  message TEXT NOT NULL DEFAULT 'De 0 a 10, qual a chance de você recomendar {{company}} para um amigo?',
  thank_you_message TEXT NOT NULL DEFAULT 'Obrigado pelo seu feedback!',
  delay_minutes INTEGER NOT NULL DEFAULT 5,
  active_channels TEXT[] DEFAULT ARRAY['whatsapp'],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES auth.users(id),
  score INTEGER CHECK (score BETWEEN 0 AND 10),
  comment TEXT,
  channel TEXT,
  responded_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.nps_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_configs_org" ON public.nps_configs;
CREATE POLICY "nps_configs_org" ON public.nps_configs
  FOR ALL USING (user_belongs_to_org(org_id));

DROP POLICY IF EXISTS "nps_responses_org" ON public.nps_responses;
CREATE POLICY "nps_responses_org" ON public.nps_responses
  FOR ALL USING (user_belongs_to_org(org_id));

-- O cron de envio procura conversas encerradas sem NPS: índice por conversa.
CREATE INDEX IF NOT EXISTS idx_nps_responses_conversation
  ON public.nps_responses(conversation_id);
