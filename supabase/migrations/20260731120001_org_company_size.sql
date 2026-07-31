-- Onboarding ↔ Configurações como fonte única (2026-07-31).
--
-- O tamanho da empresa entra no contexto coletado no onboarding (etapa
-- Empresa) e editável em Configurações > Geral > Sobre a empresa. Texto livre
-- com valores canônicos do seletor ("so_eu", "2-5", "6-20", "21-50",
-- "51-200", "200+") — sem CHECK para o seletor poder evoluir sem migration.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS company_size TEXT;
