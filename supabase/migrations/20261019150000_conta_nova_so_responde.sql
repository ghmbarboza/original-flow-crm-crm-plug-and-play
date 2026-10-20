-- Conta de canal nova nasce "só responde" (19/10/2026, decisão da Sabrina).
--
-- Até aqui o padrão era "ambos": todo número conectado já podia prospectar
-- (abordagem ativa, campanhas, lembretes). O padrão mais fechado protege o
-- número de quem só quer atender; quem quer prospectar escolhe o papel em
-- Configurações > Integrações > Canais. Contas que já existem não mudam.
ALTER TABLE public.channel_accounts ALTER COLUMN role SET DEFAULT 'passivo';
