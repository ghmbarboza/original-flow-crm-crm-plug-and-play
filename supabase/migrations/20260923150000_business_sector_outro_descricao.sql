-- Setor "Outro" com descrição (23/09/2026).
--
-- O wizard grava `outro:<descrição>` (StepEmpresa.tsx) e o CHECK original só
-- aceitava o valor exato 'outro': quem escolhia "Outro" e descrevia o setor
-- recebia erro ao salvar. A regra passa a aceitar o prefixo.
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_business_sector_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_business_sector_check CHECK (
  business_sector IS NULL
  OR business_sector IN ('imobiliario','saude','educacao','varejo','servicos','tecnologia','juridico','financeiro','alimentacao','beleza','outro')
  OR business_sector LIKE 'outro:%'
);
