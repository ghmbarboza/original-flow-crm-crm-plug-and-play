-- =====================================================
-- FlowCRM 2.0 — Migration 3: WhatsApp (duplo provedor), IA, follow-up e campanhas
--
-- Regra de produto: um único número de WhatsApp por empresa. A interface trava
-- em uma instância ativa; as tabelas aceitam N linhas para permitir a troca de
-- provedor sem perder o histórico e uma eventual evolução para múltiplos números.
-- =====================================================

CREATE TABLE public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider public.whatsapp_provider NOT NULL DEFAULT 'evolution',
  distribution_mode public.distribution_mode NOT NULL DEFAULT 'open_queue',
  offline_timeout_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.evolution_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  server_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  phone_number TEXT,
  qr_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, instance_name)
);

CREATE TABLE public.meta_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  phone_number_id TEXT NOT NULL,
  business_account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  phone_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{
    "reply_groups": false,
    "reject_calls": false,
    "call_message": "",
    "always_online": false,
    "read_messages": true
  }',
  webhook_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversas: provider-agnósticas. Trocar de provedor muda o canal de envio,
-- nunca o histórico — por isso a conversa não é apagada nem recriada.
CREATE TABLE public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  status public.conversation_status NOT NULL DEFAULT 'ai_active',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  provider public.whatsapp_provider NOT NULL DEFAULT 'evolution',
  provider_conversation_id TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  tags JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone_number)
);

CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  provider_message_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  type TEXT NOT NULL DEFAULT 'text'
    CHECK (type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location')),
  content TEXT,
  media_url TEXT,
  is_from_ai BOOLEAN NOT NULL DEFAULT false,
  -- Nota interna: visível apenas para a equipe, nunca enviada ao cliente.
  is_internal_note BOOLEAN NOT NULL DEFAULT false,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- Fila de mensagens recebidas fora do horário de atendimento.
--
-- Fora de `working_hours` a IA fica em silêncio total (sem resposta automática),
-- mas a mensagem não pode ser perdida: entra aqui e é processada no próximo
-- período ativo. Também serve de ponto de serialização para o tratamento de
-- concorrência do webhook (várias mensagens do mesmo contato em rajada).
-- =====================================================
CREATE TABLE public.whatsapp_inbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'outside_working_hours'
    CHECK (reason IN ('outside_working_hours', 'ai_cooldown', 'ai_error')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'cancelled')),
  process_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config da IA ----------------------------------------------------------
-- A IA roda pelo Lovable AI Gateway: a chave é da infraestrutura, o usuário
-- nunca informa API key própria. Por isso não há coluna de token aqui.
CREATE TABLE public.whatsapp_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  agent_name TEXT NOT NULL DEFAULT 'Assistente',
  agent_tone TEXT NOT NULL DEFAULT 'profissional',
  agent_objective TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  prompt_version INTEGER NOT NULL DEFAULT 1,
  fallback_message TEXT NOT NULL DEFAULT 'Aguarde, um atendente irá ajudar em breve.',
  context_window_size INTEGER NOT NULL DEFAULT 20 CHECK (context_window_size BETWEEN 10 AND 50),
  response_delay_ms INTEGER NOT NULL DEFAULT 1500,
  cooldown_ms INTEGER NOT NULL DEFAULT 3000,
  max_ai_turns_before_human INTEGER NOT NULL DEFAULT 10,
  working_hours JSONB NOT NULL DEFAULT '{"start":"08:00","end":"18:00","days":[1,2,3,4,5]}',
  human_trigger_rules JSONB NOT NULL DEFAULT '{
    "keywords": [],
    "negative_sentiment": false,
    "max_no_understand": 3
  }',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Toda alteração de system_prompt gera uma versão; a reversão aplica imediatamente,
-- inclusive nas conversas em andamento.
CREATE TABLE public.ai_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, version)
);

CREATE TABLE public.ai_knowledge_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_knowledge_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  objection TEXT NOT NULL,
  response TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Follow-up -------------------------------------------------------------
-- Sempre enviado pela IA. Pausa em human_takeover e cancela quando o contato responde.
CREATE TABLE public.followup_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  on_limit_reached TEXT NOT NULL DEFAULT 'mark_inactive'
    CHECK (on_limit_reached IN ('mark_inactive', 'notify_agent', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.followup_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0,
  delay_hours INTEGER NOT NULL DEFAULT 24,
  message_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.followup_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled', 'limit_reached')),
  next_attempt_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campanhas -------------------------------------------------------------
-- Disponíveis apenas para provider = 'meta_official'. O intervalo entre envios é
-- fixo no código da edge function (proteção do número, termos da Meta) e não é
-- configurável pelo usuário.
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'paused', 'completed', 'cancelled')),
  message_template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]',
  audience_type TEXT NOT NULL DEFAULT 'group'
    CHECK (audience_type IN ('group', 'tag', 'filter', 'csv')),
  audience_config JSONB NOT NULL DEFAULT '{}',
  -- Contatos criados a partir do CSV da campanha recebem esta tag de origem.
  source_tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  error_msg TEXT
);
