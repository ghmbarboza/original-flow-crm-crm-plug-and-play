-- Foto de perfil do contato, vinda do WhatsApp.
--
-- A URL devolvida por `/chat/fetchProfilePictureUrl` aponta para o CDN do
-- WhatsApp (pps.whatsapp.net) e CARREGA UM PRAZO DE VALIDADE no próprio
-- endereço (parâmetro `oe`). Guardar e esquecer faria a foto sumir semanas
-- depois, sem nada no sistema explicando por quê. `avatar_synced_at` é o que
-- permite revalidar antes disso.
alter table public.contacts add column if not exists avatar_url text;
alter table public.contacts add column if not exists avatar_synced_at timestamptz;

comment on column public.contacts.avatar_url is
  'Foto de perfil do WhatsApp. A URL do pps.whatsapp.net expira, por isso avatar_synced_at controla a revalidacao.';
