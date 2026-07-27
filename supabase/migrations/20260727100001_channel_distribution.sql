-- =====================================================
-- FlowCRM 2.0 — Sprint 7 / Parte 6: distribuição de conversas por canal
--
-- pick_agent_for_channel(org, canal): escolhe um agente elegível para uma nova
-- conversa, respeitando o modo de distribuição da org e a habilitação de canal
-- do agente (profiles.assigned_channels; array vazio = atende todos).
--
--  - round_robin: retorna o agente elegível com MENOS conversas abertas (balanceia
--    a carga). Elegível = ativo, aprovado, da org e habilitado no canal.
--  - open_queue / ai_directed / sem config: retorna NULL (sem pré-atribuição — a
--    fila fica aberta ou a IA direciona).
--
-- SECURITY DEFINER: chamada pelos webhooks (service-role), sempre escopada por org.
-- =====================================================

CREATE OR REPLACE FUNCTION public.pick_agent_for_channel(p_org uuid, p_channel text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode  text;
  v_agent uuid;
BEGIN
  SELECT distribution_mode::text INTO v_mode
  FROM public.messaging_config
  WHERE org_id = p_org;

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
  ORDER BY (
    SELECT count(*) FROM public.conversations c
    WHERE c.org_id = p_org AND c.assigned_to = p.id AND c.status <> 'closed'
  ) ASC, p.created_at ASC
  LIMIT 1;

  RETURN v_agent;
END;
$$;
