-- Sprint 12 B8: importação universal (24/09/2026).
--
-- imports: uma linha por arquivo importado (contatos, empresas, negócios ou
-- atividades), com o de/para usado e o resultado. import_rows: cada linha do
-- arquivo com o que virou (criado, atualizado, pulado, erro). Desfazer apaga só
-- o que a importação criou.
CREATE TABLE IF NOT EXISTS public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('contacts', 'companies', 'deals', 'activities')),
  source TEXT NOT NULL DEFAULT 'csv',
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'undone')),
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_report TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  undone_at TIMESTAMPTZ
);
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "imports_org" ON public.imports;
CREATE POLICY "imports_org" ON public.imports
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));

CREATE TABLE IF NOT EXISTS public.import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('created', 'updated', 'skipped', 'error')),
  entity_type TEXT,
  entity_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "import_rows_org" ON public.import_rows;
CREATE POLICY "import_rows_org" ON public.import_rows
  FOR SELECT USING (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS idx_import_rows_import ON public.import_rows (import_id, row_number);

-- Desfazer: apaga o que a importação CRIOU (linhas com status created), na
-- ordem que respeita as chaves estrangeiras. O que foi atualizado fica.
CREATE OR REPLACE FUNCTION public.desfazer_importacao(p_import UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_status TEXT;
  v_atividades INTEGER := 0;
  v_negocios INTEGER := 0;
  v_contatos INTEGER := 0;
  v_empresas INTEGER := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;
  SELECT org_id, status INTO v_org, v_status FROM imports WHERE id = p_import;
  IF v_org IS NULL OR v_org <> public.current_org_id() THEN
    RAISE EXCEPTION 'Importação não encontrada';
  END IF;
  IF v_status = 'undone' THEN
    RAISE EXCEPTION 'Esta importação já foi desfeita';
  END IF;

  WITH alvo AS (SELECT entity_id FROM import_rows WHERE import_id = p_import AND status = 'created' AND entity_type = 'activity')
  DELETE FROM activities WHERE id IN (SELECT entity_id FROM alvo);
  GET DIAGNOSTICS v_atividades = ROW_COUNT;

  WITH alvo AS (SELECT entity_id FROM import_rows WHERE import_id = p_import AND status = 'created' AND entity_type = 'deal')
  DELETE FROM deals WHERE id IN (SELECT entity_id FROM alvo);
  GET DIAGNOSTICS v_negocios = ROW_COUNT;

  WITH alvo AS (SELECT entity_id FROM import_rows WHERE import_id = p_import AND status = 'created' AND entity_type = 'contact')
  DELETE FROM contacts WHERE id IN (SELECT entity_id FROM alvo);
  GET DIAGNOSTICS v_contatos = ROW_COUNT;

  WITH alvo AS (SELECT entity_id FROM import_rows WHERE import_id = p_import AND status = 'created' AND entity_type = 'company')
  DELETE FROM companies WHERE id IN (SELECT entity_id FROM alvo)
    AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.company_id = companies.id)
    AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.company_id = companies.id);
  GET DIAGNOSTICS v_empresas = ROW_COUNT;

  UPDATE imports SET status = 'undone', undone_at = now() WHERE id = p_import;
  RETURN jsonb_build_object('activities', v_atividades, 'deals', v_negocios, 'contacts', v_contatos, 'companies', v_empresas);
END;
$$;
REVOKE ALL ON FUNCTION public.desfazer_importacao(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_importacao(UUID) TO authenticated;
