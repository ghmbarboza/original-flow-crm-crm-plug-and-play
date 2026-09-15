-- Formato de entrega por destino de webhook (15/09).
--
-- O Painel Preditivo de Metas recebe no formato próprio, em
-- receive-crm-webhook: { event_type, deal: { external_id, user_email, stage,
-- value, lead_origin, ... } } com o secret no header x-webhook-secret. Em vez
-- de exigir um n8n no meio, o destino escolhe o formato e o webhook-dispatcher
-- converte na hora da entrega. A fila continua guardando o envelope padrão.

ALTER TABLE public.webhook_endpoints
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'flowcrm';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_endpoints_format_check') THEN
    ALTER TABLE public.webhook_endpoints
      ADD CONSTRAINT webhook_endpoints_format_check CHECK (format IN ('flowcrm', 'painel_preditivo'));
  END IF;
END $$;

-- O painel identifica o corretor pelo e-mail do responsável e precisa de uma
-- régua para a etapa (as etapas do FlowCRM têm nome livre por setor). Os dois
-- campos entram no envelope padrão também: acréscimo, não quebra quem já recebe.
CREATE OR REPLACE FUNCTION public.webhook_negocio_json(p_deal uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'value', d.value,
    'currency', d.currency,
    'status', d.status,
    'probability', d.probability,
    'close_date', d.close_date,
    'stage', CASE WHEN s.id IS NULL THEN NULL
                  ELSE jsonb_strip_nulls(jsonb_build_object('id', s.id, 'name', s.name, 'win_probability', s.win_probability)) END,
    'owner', CASE WHEN p.id IS NULL THEN NULL
                  ELSE jsonb_strip_nulls(jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email)) END,
    'loss_reason', lr.label,
    'custom_fields', d.custom_fields,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  ))
  FROM deals d
  LEFT JOIN pipeline_stages s ON s.id = d.stage_id
  LEFT JOIN profiles p ON p.id = d.owner_id
  LEFT JOIN loss_reasons lr ON lr.id = d.loss_reason_id
  WHERE d.id = p_deal;
$$;

REVOKE ALL ON FUNCTION public.webhook_negocio_json(uuid) FROM PUBLIC, anon, authenticated;
