-- Vários números e vários provedores ao mesmo tempo (16/10/2026).
--
-- Até aqui a empresa tinha UM provedor (messaging_config.provider) e as functions
-- escolhiam "a instância ativa mais recente" para responder, abordar e avisar.
-- A conversa não sabia por qual número entrou. Decisão da Sabrina em 16/10:
-- o número define a abordagem. Cada conta conectada (instância Evolution,
-- número Meta, conta Zernio por plataforma) vira uma linha em channel_accounts,
-- com papel (passivo: só responde; ativo: também prospecta) e perfil de IA
-- próprios. A conversa aponta para a conta pela qual entrou e tudo que sai dela
-- (IA, equipe, agendadas, follow-up, NPS) volta pelo mesmo número.
--
-- Uma conversa por número: o mesmo lead falando com dois números da empresa
-- são duas conversas, com o mesmo contato.

CREATE TABLE IF NOT EXISTS public.channel_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider public.messaging_provider NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp','instagram','facebook','telegram','twitter','youtube','reddit','bluesky','threads','linkedin','tiktok','pinterest','googlebusiness','snapchat','discord')),
  evolution_config_id UUID REFERENCES public.evolution_configs(id) ON DELETE CASCADE,
  meta_config_id UUID REFERENCES public.meta_configs(id) ON DELETE CASCADE,
  -- _id da conta no Zernio (uma por plataforma conectada no profile).
  zernio_account_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  -- passivo: a IA só responde quem escreve. ativo: também inicia conversa
  -- (abordagem ativa, campanhas). ambos: os dois.
  role TEXT NOT NULL DEFAULT 'ambos' CHECK (role IN ('passivo', 'ativo', 'ambos')),
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_instruction TEXT NOT NULL DEFAULT '' CHECK (length(ai_instruction) <= 4000),
  ai_funnel_mode TEXT NOT NULL DEFAULT 'inherit' CHECK (ai_funnel_mode IN ('inherit', 'auto', 'suggest')),
  -- Conta pela qual saem os avisos de WhatsApp para a equipe e os lembretes.
  notifications_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(evolution_config_id, meta_config_id, zernio_account_id) = 1),
  UNIQUE (evolution_config_id),
  UNIQUE (meta_config_id),
  UNIQUE (org_id, zernio_account_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_accounts_org ON public.channel_accounts (org_id, provider, channel) WHERE is_active;
-- Só uma conta de notificações por organização.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_channel_accounts_notificacoes
  ON public.channel_accounts (org_id) WHERE notifications_default;

ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_accounts_select ON public.channel_accounts;
CREATE POLICY channel_accounts_select ON public.channel_accounts
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
DROP POLICY IF EXISTS channel_accounts_admin_write ON public.channel_accounts;
CREATE POLICY channel_accounts_admin_write ON public.channel_accounts
  FOR ALL TO authenticated
  USING (public.org_admin(org_id)) WITH CHECK (public.org_admin(org_id));

-- updated_at automático, como nas demais tabelas de configuração.
CREATE OR REPLACE FUNCTION public.channel_accounts_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_channel_accounts_touch ON public.channel_accounts;
CREATE TRIGGER tg_channel_accounts_touch BEFORE UPDATE ON public.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public.channel_accounts_touch();

-- Instância Evolution e número Meta viram conta sozinhos: quem conecta pelo
-- wizard não precisa de um segundo passo. Desconectar (is_active=false na
-- tabela do provedor) desliga a conta junto.
CREATE OR REPLACE FUNCTION public.sincronizar_conta_evolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.channel_accounts (org_id, provider, channel, evolution_config_id, label, is_active)
    VALUES (NEW.org_id, 'evolution', 'whatsapp', NEW.id, COALESCE(NULLIF(NEW.display_name, ''), NEW.instance_name), NEW.is_active)
    ON CONFLICT (evolution_config_id) DO NOTHING;
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE public.channel_accounts SET is_active = NEW.is_active WHERE evolution_config_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_evolution_configs_conta ON public.evolution_configs;
CREATE TRIGGER tg_evolution_configs_conta AFTER INSERT OR UPDATE OF is_active ON public.evolution_configs
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_conta_evolution();

CREATE OR REPLACE FUNCTION public.sincronizar_conta_meta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.channel_accounts (org_id, provider, channel, meta_config_id, label, is_active)
    VALUES (NEW.org_id, 'meta_official', 'whatsapp', NEW.id, COALESCE(NULLIF(NEW.display_name, ''), NEW.phone_number, NEW.phone_number_id), NEW.is_active)
    ON CONFLICT (meta_config_id) DO NOTHING;
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE public.channel_accounts SET is_active = NEW.is_active WHERE meta_config_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_meta_configs_conta ON public.meta_configs;
CREATE TRIGGER tg_meta_configs_conta AFTER INSERT OR UPDATE OF is_active ON public.meta_configs
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_conta_meta();

-- Contas das instâncias que já existem.
INSERT INTO public.channel_accounts (org_id, provider, channel, evolution_config_id, label, is_active)
SELECT e.org_id, 'evolution', 'whatsapp', e.id, COALESCE(NULLIF(e.display_name, ''), e.instance_name), e.is_active
FROM public.evolution_configs e
ON CONFLICT (evolution_config_id) DO NOTHING;

INSERT INTO public.channel_accounts (org_id, provider, channel, meta_config_id, label, is_active)
SELECT m.org_id, 'meta_official', 'whatsapp', m.id, COALESCE(NULLIF(m.display_name, ''), m.phone_number, m.phone_number_id), m.is_active
FROM public.meta_configs m
ON CONFLICT (meta_config_id) DO NOTHING;

-- A conversa passa a saber por qual conta entrou.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel_account_id UUID REFERENCES public.channel_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_conta ON public.conversations (org_id, channel_account_id);

-- Conversas antigas: a conta é a que as functions escolhiam até agora (a
-- instância ativa mais recente da org). Zernio fica em branco e é adotada na
-- próxima mensagem recebida (ver _shared/conversa.ts).
UPDATE public.conversations c
SET channel_account_id = ca.id
FROM public.channel_accounts ca
JOIN public.evolution_configs e ON e.id = ca.evolution_config_id
WHERE c.channel_account_id IS NULL
  AND c.provider = 'evolution'
  AND ca.org_id = c.org_id
  AND e.id = (
    SELECT e2.id FROM public.evolution_configs e2
    WHERE e2.org_id = c.org_id
    ORDER BY e2.is_active DESC, e2.created_at DESC
    LIMIT 1
  );

UPDATE public.conversations c
SET channel_account_id = ca.id
FROM public.channel_accounts ca
JOIN public.meta_configs m ON m.id = ca.meta_config_id
WHERE c.channel_account_id IS NULL
  AND c.provider = 'meta_official'
  AND ca.org_id = c.org_id
  AND m.id = (
    SELECT m2.id FROM public.meta_configs m2
    WHERE m2.org_id = c.org_id
    ORDER BY m2.is_active DESC, m2.created_at DESC
    LIMIT 1
  );

-- Uma conversa por conta: o mesmo telefone pode ter uma conversa em cada número
-- da empresa. Conversa sem conta (histórico) continua única por canal.
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_unique_channel_contact;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_unica_por_conta
  ON public.conversations (org_id, channel, phone_number, COALESCE(channel_account_id, '00000000-0000-0000-0000-000000000000'::uuid));
