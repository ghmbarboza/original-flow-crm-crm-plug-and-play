-- Telas das contas de canal (19/10/2026): bloco 2 dos canais múltiplos.
--
-- O app precisa listar as contas (número, papel, IA, avisos) com o estado real
-- da conexão, e todo membro da organização precisa enxergar a lista: é ela que
-- decide se a Inbox abre ou se aparece o assistente "Configurar WhatsApp".
-- As tabelas dos provedores (evolution_configs, meta_configs, zernio_configs)
-- guardam chave e token e continuam só do admin; esta função devolve apenas o
-- que a tela mostra, sem credencial.

CREATE OR REPLACE FUNCTION public.contas_de_canal()
RETURNS TABLE (
  id uuid,
  provider public.messaging_provider,
  channel text,
  label text,
  role text,
  ai_enabled boolean,
  ai_instruction text,
  ai_funnel_mode text,
  notifications_default boolean,
  is_active boolean,
  created_at timestamptz,
  evolution_config_id uuid,
  meta_config_id uuid,
  zernio_account_id text,
  -- conectada | aguardando | desconectada | desligada
  estado text,
  -- telefone, nome da instância ou id da conta: o que identifica o número na tela
  detalhe text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT
    ca.id, ca.provider, ca.channel, ca.label, ca.role, ca.ai_enabled, ca.ai_instruction, ca.ai_funnel_mode,
    ca.notifications_default, ca.is_active, ca.created_at, ca.evolution_config_id, ca.meta_config_id, ca.zernio_account_id,
    CASE
      WHEN NOT ca.is_active THEN 'desligada'
      WHEN ca.provider = 'evolution' THEN
        CASE e.status WHEN 'connected' THEN 'conectada' WHEN 'disconnected' THEN 'desconectada' ELSE 'aguardando' END
      WHEN ca.provider = 'meta_official' THEN
        CASE WHEN m.webhook_verified AND m.is_active THEN 'conectada' ELSE 'aguardando' END
      ELSE
        CASE WHEN z.status IN ('connected', 'active') THEN 'conectada' ELSE 'aguardando' END
    END AS estado,
    CASE ca.provider
      WHEN 'evolution' THEN COALESCE(NULLIF(e.phone_number, ''), e.instance_name)
      WHEN 'meta_official' THEN COALESCE(NULLIF(m.phone_number, ''), m.phone_number_id)
      ELSE COALESCE(ca.zernio_account_id, z.profile_id)
    END AS detalhe
  FROM public.channel_accounts ca
  LEFT JOIN public.evolution_configs e ON e.id = ca.evolution_config_id
  LEFT JOIN public.meta_configs m ON m.id = ca.meta_config_id
  LEFT JOIN public.zernio_configs z ON z.org_id = ca.org_id AND ca.provider = 'zernio'
  WHERE ca.org_id = public.current_org_id()
  ORDER BY ca.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.contas_de_canal() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contas_de_canal() TO authenticated;

-- Só uma conta por organização manda os avisos de WhatsApp (índice parcial
-- uniq_channel_accounts_notificacoes). Trocar em dois updates pela tela abria
-- a chance de o segundo falhar e a org ficar sem conta: aqui é uma transação.
CREATE OR REPLACE FUNCTION public.definir_conta_de_notificacoes(p_conta uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org uuid := public.current_org_id();
BEGIN
  IF v_org IS NULL OR NOT public.org_admin(v_org) THEN
    RAISE EXCEPTION 'Só o administrador escolhe o número que envia os avisos.';
  END IF;
  -- Dois admins trocando ao mesmo tempo: um espera o outro, em vez de bater no
  -- índice único e devolver erro cru para a tela.
  PERFORM pg_advisory_xact_lock(hashtext('conta_de_notificacoes:' || v_org::text));
  IF p_conta IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.channel_accounts
    WHERE id = p_conta AND org_id = v_org AND is_active AND channel = 'whatsapp'
  ) THEN
    RAISE EXCEPTION 'Conta de WhatsApp não encontrada nesta organização.';
  END IF;
  UPDATE public.channel_accounts SET notifications_default = false
  WHERE org_id = v_org AND notifications_default;
  IF p_conta IS NOT NULL THEN
    UPDATE public.channel_accounts SET notifications_default = true WHERE id = p_conta;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.definir_conta_de_notificacoes(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.definir_conta_de_notificacoes(uuid) TO authenticated;
