-- Sprint 10B-1 — Conectividade ERP (webhooks configuráveis).
--
-- erp_integration_configs é única por org: URL/auth/eventos de saída com
-- mapeamento de campos, e token + handlers de entrada. erp_webhook_logs é a
-- trilha de debugging dos dois sentidos.
--
-- Policies restritas a admin — o guia escreve has_role('admin'), mas a função
-- real do projeto é has_role(uuid, app_role).

CREATE TABLE IF NOT EXISTS public.erp_integration_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  outbound_url TEXT,
  outbound_auth_type TEXT DEFAULT 'none'
    CHECK (outbound_auth_type IN ('none', 'bearer', 'basic', 'api_key')),
  outbound_auth_config JSONB DEFAULT '{}',
  outbound_events TEXT[] DEFAULT '{}',
  outbound_field_mappings JSONB DEFAULT '{}',
  inbound_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  inbound_event_handlers JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT false,
  last_outbound_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.erp_integration_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_config_admin" ON public.erp_integration_configs;
CREATE POLICY "erp_config_admin" ON public.erp_integration_configs
  FOR ALL USING (
    user_belongs_to_org(org_id)
    AND has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.erp_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  event_type TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
  error_msg TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.erp_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_logs_admin" ON public.erp_webhook_logs;
CREATE POLICY "erp_logs_admin" ON public.erp_webhook_logs
  FOR SELECT USING (
    user_belongs_to_org(org_id)
    AND has_role(auth.uid(), 'admin'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_erp_logs_org ON public.erp_webhook_logs(org_id, created_at DESC);
