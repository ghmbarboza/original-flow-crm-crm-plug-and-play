-- =====================================================
-- FlowCRM 2.0 — Sprint 8 / Migration 8C: distribuição avançada por canal
--
-- Cada canal passa a poder ter seu próprio modo de distribuição e seu teto de
-- conversas por agente. Sem configuração para o canal, vale o modo global de
-- messaging_config — nada muda para quem não configurar.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.channel_distribution_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN (
    'whatsapp','instagram','facebook','telegram',
    'twitter','youtube','reddit','bluesky','threads'
  )),
  distribution_mode public.distribution_mode NOT NULL DEFAULT 'open_queue',
  offline_timeout_minutes integer NOT NULL DEFAULT 30
    CHECK (offline_timeout_minutes > 0),
  -- NULL = sem limite.
  max_conversations_per_agent integer DEFAULT NULL
    CHECK (max_conversations_per_agent IS NULL OR max_conversations_per_agent > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, channel)
);

ALTER TABLE public.channel_distribution_configs ENABLE ROW LEVEL SECURITY;

-- Segue o padrão do projeto: helpers SECURITY DEFINER em vez de subquery em
-- profiles dentro da policy, que recursaria no RLS de profiles.
DROP POLICY IF EXISTS channel_dist_read ON public.channel_distribution_configs;
CREATE POLICY channel_dist_read ON public.channel_distribution_configs
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS channel_dist_admin_all ON public.channel_distribution_configs;
CREATE POLICY channel_dist_admin_all ON public.channel_distribution_configs
  FOR ALL TO authenticated
  USING (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.user_belongs_to_org(org_id) AND public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_channel_dist_org
  ON public.channel_distribution_configs (org_id, channel);

-- =====================================================
-- View de carga por agente, consumida pelo painel de supervisão.
--
-- security_invoker = true é obrigatório: sem isso a view roda com os direitos
-- do dono e ignora o RLS de conversations, o que exporia a carga de todas as
-- organizações a qualquer usuário autenticado. Com invoker, cada um enxerga
-- apenas as conversas que já poderia ler.
-- =====================================================
DROP VIEW IF EXISTS public.agent_conversation_load;
CREATE VIEW public.agent_conversation_load
WITH (security_invoker = true) AS
SELECT
  c.org_id,
  c.assigned_to AS agent_id,
  c.channel,
  count(*)::bigint AS active_conversations,
  COALESCE(sum(c.unread_count), 0)::bigint AS total_unread
FROM public.conversations c
WHERE c.status IN ('ai_active', 'human_takeover')
  AND c.assigned_to IS NOT NULL
GROUP BY c.org_id, c.assigned_to, c.channel;

GRANT SELECT ON public.agent_conversation_load TO authenticated;

-- =====================================================
-- pick_agent_for_channel: reescrita para honrar a config por canal.
--
-- Muda em relação à versão do Sprint 7:
--  1. O modo vem de channel_distribution_configs do canal; sem linha para o
--     canal, cai no modo global de messaging_config (comportamento anterior).
--  2. Respeita max_conversations_per_agent: agente no teto deixa de ser
--     elegível. Se todos estiverem no teto, devolve NULL e a conversa cai na
--     fila geral em vez de estourar o limite de alguém.
-- =====================================================
CREATE OR REPLACE FUNCTION public.pick_agent_for_channel(p_org uuid, p_channel text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode  text;
  v_max   integer;
  v_agent uuid;
BEGIN
  SELECT d.distribution_mode::text, d.max_conversations_per_agent
    INTO v_mode, v_max
  FROM public.channel_distribution_configs d
  WHERE d.org_id = p_org AND d.channel = p_channel;

  -- Sem config específica do canal: usa o modo global da org.
  IF v_mode IS NULL THEN
    SELECT m.distribution_mode::text INTO v_mode
    FROM public.messaging_config m
    WHERE m.org_id = p_org;
  END IF;

  IF v_mode IS DISTINCT FROM 'round_robin' THEN
    RETURN NULL;
  END IF;

  SELECT p.id INTO v_agent
  FROM public.profiles p
  WHERE p.org_id = p_org
    AND p.is_active
    AND p.is_approved
    AND (
      COALESCE(array_length(p.assigned_channels, 1), 0) = 0
      OR p_channel = ANY(p.assigned_channels)
    )
    -- Teto por canal: agente lotado sai da disputa.
    AND (
      v_max IS NULL
      OR (
        SELECT count(*) FROM public.conversations c
        WHERE c.org_id = p_org
          AND c.assigned_to = p.id
          AND c.channel = p_channel
          AND c.status <> 'closed'
      ) < v_max
    )
  ORDER BY (
    SELECT count(*) FROM public.conversations c
    WHERE c.org_id = p_org AND c.assigned_to = p.id AND c.status <> 'closed'
  ) ASC, p.created_at ASC
  LIMIT 1;

  RETURN v_agent;
END;
$$;
