-- Toda conversa nova abre um negócio na primeira etapa do funil.
--
-- Antes, negócio só existia se alguém criasse à mão em /deals: o lead entrava
-- pelo WhatsApp, conversava com a IA e o funil continuava vazio. A detecção de
-- intenção de compra também não ajudava — ela MOVE um negócio de etapa, e não
-- havia nenhum para mover.
--
-- É uma escolha com efeito colateral consciente: todo "oi", inclusive engano e
-- suporte, vira negócio, e a taxa de conversão cai porque o denominador cresce.
-- Fica ligado por padrão (é o comportamento pedido) e desligável por
-- organização, sem tocar em código.
alter table public.organizations
  add column if not exists auto_create_deal_on_conversation boolean not null default true;

comment on column public.organizations.auto_create_deal_on_conversation is
  'Toda conversa nova de atendimento abre um negocio na primeira etapa do funil. Desligado, o negocio e criado a mao ou pela intencao de compra.';
