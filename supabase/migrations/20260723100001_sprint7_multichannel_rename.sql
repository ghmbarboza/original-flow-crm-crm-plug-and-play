-- =====================================================
-- FlowCRM 2.0 — Sprint 7 / Migration 7A: Renomeação estrutural (canal-agnóstico)
--
-- Torna a infraestrutura de mensagens canal-agnóstica, renomeando whatsapp_*
-- para nomes genéricos e adicionando a base multicanal (coluna `channel`,
-- identificadores de canal, enum messaging_provider + 'zernio', tabela
-- zernio_configs, assigned_channels em profiles e deduplicação por canal).
--
-- NÃO altera lógica de atendimento (ai_active/human_takeover/closed), RLS das
-- tabelas existentes, follow-up nem IA.
--
-- Notas de segurança (validadas no banco antes de escrever):
--  * Triggers e FKs seguem a tabela no RENAME (ligados por OID) — nada quebra.
--  * Nenhuma função/view referencia os nomes antigos por string.
--  * A publicação supabase_realtime mantém as tabelas sob os novos nomes
--    automaticamente após o RENAME — por isso NÃO há DROP/ADD de realtime aqui
--    (o passo 9 do doc falharia, pois os nomes antigos deixam de existir).
-- =====================================================

-- 1. Renomear tabelas ---------------------------------------------------------
ALTER TABLE public.whatsapp_conversations RENAME TO conversations;
ALTER TABLE public.whatsapp_messages      RENAME TO conversation_messages;
ALTER TABLE public.whatsapp_config        RENAME TO messaging_config;
ALTER TABLE public.whatsapp_ai_config     RENAME TO ai_messaging_config;
ALTER TABLE public.evolution_instances    RENAME TO evolution_configs;
ALTER TABLE public.meta_instances         RENAME TO meta_configs;

-- 2. Enum de provedor: renomear e adicionar 'zernio' --------------------------
--    ADD VALUE é seguro dentro da transação (PG12+): o valor não é USADO nesta
--    migration, apenas registrado no enum.
ALTER TYPE public.whatsapp_provider RENAME TO messaging_provider;
ALTER TYPE public.messaging_provider ADD VALUE IF NOT EXISTS 'zernio';

-- 3. Colunas multicanal em conversations --------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp','instagram','facebook','telegram','twitter','youtube','reddit','bluesky','threads'));

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel_contact_id   TEXT,
  ADD COLUMN IF NOT EXISTS channel_contact_name TEXT;

-- 4. assigned_channels em profiles (habilitação de agente por canal) -----------
--    Array vazio = sem restrição (atende qualquer canal).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_channels TEXT[] NOT NULL DEFAULT '{}';

-- 5. Deduplicação por canal ---------------------------------------------------
--    UNIQUE(org_id, phone_number) -> UNIQUE(org_id, channel, phone_number).
--    Para canais sem telefone, phone_number guarda o channel_contact_id.
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_org_id_phone_number_key;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_unique_channel_contact UNIQUE (org_id, channel, phone_number);

-- 6. Índices: recriar com nomes canal-agnósticos ------------------------------
DROP INDEX IF EXISTS public.idx_wpp_conv_org;
DROP INDEX IF EXISTS public.idx_wpp_conv_phone;
DROP INDEX IF EXISTS public.idx_wpp_conv_last;
DROP INDEX IF EXISTS public.idx_wpp_msg_conv;

CREATE INDEX IF NOT EXISTS idx_conv_org     ON public.conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conv_channel ON public.conversations(org_id, channel);
CREATE INDEX IF NOT EXISTS idx_conv_phone   ON public.conversations(org_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_conv_last    ON public.conversations(org_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_conv     ON public.conversation_messages(conversation_id, sent_at DESC);

-- 7. Tabela de configuração do Zernio -----------------------------------------
CREATE TABLE IF NOT EXISTS public.zernio_configs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key        TEXT NOT NULL,
  profile_id     TEXT NOT NULL,
  webhook_secret TEXT,
  active_channels TEXT[] NOT NULL DEFAULT ARRAY['whatsapp'],
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.zernio_configs ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro da org. Escrita: apenas admin da org.
DROP POLICY IF EXISTS "zernio_configs_read" ON public.zernio_configs;
CREATE POLICY "zernio_configs_read" ON public.zernio_configs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "zernio_configs_write" ON public.zernio_configs;
CREATE POLICY "zernio_configs_write" ON public.zernio_configs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
