-- =====================================================
-- FlowCRM 2.0 — Sprint 7 / Parte 7: criação automática de contato multicanal
--
-- Contatos que chegam por canais sem telefone (Instagram, Telegram, ...) guardam o
-- identificador da plataforma em custom_fields:
--   { "channel_contact_id": "123456789", "channel": "instagram" }
--
-- Os webhooks resolvem o contato por (org_id, channel, channel_contact_id) a cada
-- mensagem recebida. Sem índice isso vira seq scan em contacts, então indexamos as
-- duas chaves de custom_fields usadas na busca.
--
-- Parcial em merged_into_id IS NULL: contatos mesclados nunca são alvo da busca.
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_contacts_channel_contact_id
  ON public.contacts (
    org_id,
    (custom_fields ->> 'channel'),
    (custom_fields ->> 'channel_contact_id')
  )
  WHERE merged_into_id IS NULL;
