-- Sprint 10A-6 — Log de SLA de atendimento.
--
-- sla_configs é única por org (UNIQUE org_id), como followup_configs. As
-- métricas por conversa moram em colunas de conversations: first_response_at é
-- gravado na primeira resposta humana/IA, sla_breached quando o limite estoura.

CREATE TABLE IF NOT EXISTS public.sla_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_response_minutes INTEGER NOT NULL DEFAULT 30,
  resolution_hours INTEGER NOT NULL DEFAULT 24,
  alert_threshold_percent INTEGER NOT NULL DEFAULT 80,
  active_channels TEXT[] DEFAULT ARRAY['whatsapp'],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sla_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sla_configs_org" ON public.sla_configs;
CREATE POLICY "sla_configs_org" ON public.sla_configs
  FOR ALL USING (user_belongs_to_org(org_id));

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
