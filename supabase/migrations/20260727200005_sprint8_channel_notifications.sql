-- =====================================================
-- FlowCRM 2.0 — Sprint 8 / Parte 5: notificações de canal
--
-- Os produtores do Sprint 6 só cobrem eventos de CRM (deal, tarefa, lead).
-- Aqui entram os três eventos operacionais de atendimento multicanal:
--
--   conversa_sem_agente     → conversa nova entrou sem ninguém atribuído
--   agente_no_limite        → agente bateu o teto do canal
--   conversa_sem_resposta   → conversa parada há mais que o tolerado
--
-- Os dois primeiros são triggers em conversations. O terceiro não pode ser
-- trigger: "passou X minutos sem nada acontecer" é ausência de evento, e
-- trigger só dispara quando algo muda. Vira uma função varrida por cron, no
-- mesmo modelo do followup-dispatcher.
-- =====================================================

-- ---------------------------------------------------------------
-- 1) Conversa nova sem agente atribuído.
--
-- Só notifica quando a org está em round_robin e mesmo assim ninguém foi
-- escolhido — aí é sinal de que não há agente elegível ou todos estão lotados.
-- Em open_queue, conversa sem dono é o comportamento esperado e notificar seria
-- ruído a cada mensagem.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_unassigned_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    (SELECT d.distribution_mode::text FROM public.channel_distribution_configs d
      WHERE d.org_id = NEW.org_id AND d.channel = NEW.channel),
    (SELECT m.distribution_mode::text FROM public.messaging_config m
      WHERE m.org_id = NEW.org_id)
  ) INTO v_mode;

  IF v_mode IS DISTINCT FROM 'round_robin' THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_org_admins(
    NEW.org_id,
    'conversa_sem_agente',
    'Conversa sem agente',
    format('Nova conversa em %s entrou sem agente disponível.', NEW.channel),
    'conversation',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_conversation_created_notify_unassigned ON public.conversations;
CREATE TRIGGER on_conversation_created_notify_unassigned
  AFTER INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.notify_unassigned_conversation();

-- ---------------------------------------------------------------
-- 2) Agente atingiu o teto do canal.
--
-- Dispara na atribuição que fecha a conta, não em toda conversa depois disso —
-- por isso o teste é "= v_max" e não ">=".
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_agent_at_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max   integer;
  v_count integer;
  v_name  text;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  -- Só quando a atribuição mudou, para UPDATE de outra coluna não reavaliar.
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT d.max_conversations_per_agent INTO v_max
  FROM public.channel_distribution_configs d
  WHERE d.org_id = NEW.org_id AND d.channel = NEW.channel;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.conversations c
  WHERE c.org_id = NEW.org_id
    AND c.assigned_to = NEW.assigned_to
    AND c.channel = NEW.channel
    AND c.status <> 'closed';

  IF v_count = v_max THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.assigned_to;
    PERFORM public.notify_org_admins(
      NEW.org_id,
      'agente_no_limite',
      'Agente no limite',
      format('%s atingiu %s conversas em %s.', COALESCE(v_name, 'Um agente'), v_max, NEW.channel),
      'conversation',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_conversation_assigned_notify_capacity ON public.conversations;
CREATE TRIGGER on_conversation_assigned_notify_capacity
  AFTER INSERT OR UPDATE OF assigned_to ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.notify_agent_at_capacity();

-- ---------------------------------------------------------------
-- 3) Conversa sem resposta há mais que o tolerado.
--
-- Varredura, não trigger. Considera "sem resposta" a conversa aberta cuja última
-- mensagem é do contato (inbound) e cujo last_message_at passou do limite.
--
-- O limite por canal reusa offline_timeout_minutes de channel_distribution_configs;
-- sem config para o canal, cai no offline_timeout_minutes global da org.
--
-- Notifica o agente atribuído; sem agente, cai para os admins — senão a conversa
-- mais crítica (a que ninguém pegou) seria a única a não gerar aviso.
--
-- Idempotência: só avisa se ainda não houver notificação desse evento para a
-- mesma conversa dentro da janela, para o cron não repetir o alerta a cada
-- passagem enquanto a conversa segue parada.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_stale_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r     record;
  v_sent integer := 0;
BEGIN
  FOR r IN
    SELECT
      c.id, c.org_id, c.channel, c.assigned_to, c.last_message_at,
      COALESCE(d.offline_timeout_minutes, m.offline_timeout_minutes, 30) AS limite
    FROM public.conversations c
    LEFT JOIN public.channel_distribution_configs d
      ON d.org_id = c.org_id AND d.channel = c.channel
    LEFT JOIN public.messaging_config m
      ON m.org_id = c.org_id
    WHERE c.status <> 'closed'
      AND c.last_message_at IS NOT NULL
      -- Última mensagem é do contato: a bola está do nosso lado. Conversa cuja
      -- última mensagem é nossa está aguardando o cliente, não atrasada.
      AND (
        SELECT cm.direction FROM public.conversation_messages cm
        WHERE cm.conversation_id = c.id
        ORDER BY cm.sent_at DESC
        LIMIT 1
      ) = 'inbound'
      AND c.last_message_at < now() - make_interval(
        mins => COALESCE(d.offline_timeout_minutes, m.offline_timeout_minutes, 30)
      )
  LOOP
    -- Já avisamos desta conversa depois da última mensagem dela? Então pula.
    -- notifications guarda o evento na coluna `type` (create_notification
    -- recebe p_event_type e grava ali).
    IF EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.org_id = r.org_id
        AND n.type = 'conversa_sem_resposta'
        AND n.entity_id = r.id
        AND n.created_at > r.last_message_at
    ) THEN
      CONTINUE;
    END IF;

    IF r.assigned_to IS NOT NULL THEN
      PERFORM public.create_notification(
        r.org_id, r.assigned_to, 'conversa_sem_resposta',
        'Conversa sem resposta',
        format('Uma conversa em %s está sem resposta há mais de %s min.', r.channel, r.limite),
        'conversation', r.id
      );
    ELSE
      PERFORM public.notify_org_admins(
        r.org_id, 'conversa_sem_resposta',
        'Conversa sem resposta',
        format('Uma conversa em %s, sem agente, está parada há mais de %s min.', r.channel, r.limite),
        'conversation', r.id
      );
    END IF;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

-- ---------------------------------------------------------------
-- Agendamento: a varredura só tem valor se rodar sozinha. A cada 5 minutos.
--
-- A granularidade útil é limitada pelo próprio intervalo: um limite de 30 min
-- configurado no canal vira, na prática, um aviso entre 30 e 35 minutos. Para
-- limites bem menores que 5 min, encurte também este agendamento.
--
-- unschedule antes de schedule para a migration ser reexecutável sem duplicar
-- o job (cron.schedule com o mesmo nome atualiza, mas em versões antigas do
-- pg_cron não atualizava — ser explícito evita depender disso).
-- ---------------------------------------------------------------
SELECT cron.unschedule('notify-stale-conversations')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-stale-conversations');

SELECT cron.schedule(
  'notify-stale-conversations',
  '*/5 * * * *',
  $$SELECT public.notify_stale_conversations()$$
);
