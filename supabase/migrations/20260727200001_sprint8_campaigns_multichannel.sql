-- =====================================================
-- FlowCRM 2.0 — Sprint 8 / Migration 8A: campanhas multicanal
--
-- Campanhas deixam de ser só de WhatsApp: passam a ter canal próprio, e os
-- destinatários passam a aceitar identificador de plataforma além de telefone
-- (Instagram, Telegram e afins não têm número).
--
-- NOTA DE RECONCILIAÇÃO: o plano do Sprint 8 também pedia ADD COLUMN provider
-- aqui, mas essa coluna (e o CHECK meta_official/zernio) já entrou no Sprint 7,
-- na 20260727100003_campaign_provider.sql. Repetir o ADD COLUMN quebraria a
-- migration, então ele fica de fora — o resultado final é o mesmo.
-- =====================================================

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_channel_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_channel_check
  CHECK (channel IN (
    'whatsapp','instagram','facebook','telegram',
    'twitter','youtube','reddit','bluesky','threads'
  ));

-- Identificador do destinatário no canal. Para WhatsApp continua valendo
-- phone_number; nos demais canais é aqui que fica o id da plataforma.
ALTER TABLE public.campaign_recipients
  ADD COLUMN IF NOT EXISTS channel_contact_id text;

-- A listagem de campanhas filtra por canal e status dentro da org.
CREATE INDEX IF NOT EXISTS idx_campaigns_channel
  ON public.campaigns (org_id, channel, status);

-- ---------------------------------------------------------------
-- Coerência canal x provedor: a Meta Oficial só entrega em WhatsApp,
-- Instagram e Facebook. Qualquer outro canal exige Zernio. Barrar na
-- escrita evita campanha criada num par impossível, que só falharia
-- no disparo, destinatário a destinatário.
-- ---------------------------------------------------------------
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_channel_provider_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_channel_provider_check
  CHECK (
    provider = 'zernio'
    OR channel IN ('whatsapp', 'instagram', 'facebook')
  );
