-- =====================================================
-- FlowCRM 2.0 — Sprint 7: campanhas por provedor (Meta Oficial e Zernio)
--
-- Regra de negócio do Sprint 7: campanhas em massa valem para Meta Oficial e Zernio.
-- Evolution fica bloqueada (a API não-oficial não permite disparo em massa).
--
-- provider: quem entrega a campanha. Default meta_official para não mudar o
-- comportamento das campanhas que já existem.
--
-- template_name / template_language: obrigatórios quando provider = 'zernio'.
-- O Zernio abre conversa de WhatsApp apenas com template aprovado pela Meta
-- (POST /v1/inbox/conversations devolve TEMPLATE_REQUIRED sem ele) — mensagem
-- livre só é permitida dentro da janela de 24h, depois que o contato responde.
-- Os valores das variáveis saem dos placeholders {{...}} de message_template,
-- na ordem em que aparecem, renderizados por contato.
-- =====================================================

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'meta_official',
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS template_language text;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_provider_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_provider_check
  CHECK (provider IN ('meta_official', 'zernio'));

-- Campanha do Zernio sem template não tem como ser entregue: barra na escrita em
-- vez de deixar o dispatcher falhar destinatário a destinatário.
ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_zernio_requires_template;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_zernio_requires_template
  CHECK (
    provider <> 'zernio'
    OR (template_name IS NOT NULL AND template_language IS NOT NULL)
  );

-- ---------------------------------------------------------------
-- Correção de duas constraints que já não batiam com o que a UI grava:
--
--  - audience_type: o formulário oferece "Todos com WhatsApp" e grava 'all',
--    que não estava na lista permitida.
--  - status: campanha com agendamento nasce 'scheduled', que também faltava.
--
-- Nesse estado, qualquer criação de campanha por esses caminhos violava a
-- constraint no INSERT. Alinhamos as listas ao vocabulário que a aplicação usa.
-- ---------------------------------------------------------------

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_audience_type_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_audience_type_check
  CHECK (audience_type IN ('all', 'group', 'tag', 'filter', 'csv'));

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled'));
