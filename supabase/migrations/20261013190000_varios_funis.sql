-- 13/10/2026: a organização passa a ter mais de um funil.
--
-- O banco já tinha `pipelines` e `pipeline_stages.pipeline_id`, mas nada
-- impedia dois funis marcados como padrão nem um movimento automático levar o
-- negócio para a etapa de outro funil. Esta migration fecha as duas pontas.

-- 1. Um único funil padrão por organização -----------------------------------
-- Antes do índice: se alguma instalação já tiver dois padrões, fica o mais antigo
-- (é o que todo o código já escolhia no desempate).
WITH ordenados AS (
  SELECT id, row_number() OVER (PARTITION BY org_id ORDER BY created_at, id) AS posicao
    FROM public.pipelines
   WHERE is_default
)
UPDATE public.pipelines p
   SET is_default = false
  FROM ordenados o
 WHERE o.id = p.id AND o.posicao > 1;

-- Organização com funil, mas nenhum marcado: o mais antigo vira o padrão.
UPDATE public.pipelines p
   SET is_default = true
 WHERE NOT EXISTS (SELECT 1 FROM public.pipelines d WHERE d.org_id = p.org_id AND d.is_default)
   AND p.id = (SELECT id FROM public.pipelines m WHERE m.org_id = p.org_id ORDER BY created_at, id LIMIT 1);

CREATE UNIQUE INDEX IF NOT EXISTS pipelines_um_padrao_por_org
  ON public.pipelines (org_id) WHERE is_default;

-- 2. Trocar o funil padrão em uma operação só --------------------------------
-- Pelo navegador seriam dois updates (desmarca um, marca outro) e uma falha no
-- meio deixaria a organização sem padrão. SECURITY INVOKER: vale a RLS de
-- pipelines, então só alcança funil da própria organização.
CREATE OR REPLACE FUNCTION public.set_default_pipeline(_pipeline_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM pipelines WHERE id = _pipeline_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Funil não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE pipelines SET is_default = false WHERE org_id = v_org AND is_default AND id <> _pipeline_id;
  UPDATE pipelines SET is_default = true WHERE id = _pipeline_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_pipeline(uuid) TO authenticated;

-- 3. Movimento automático não troca o negócio de funil -----------------------
-- mover_negocio é o caminho da IA, das automações e das integrações. Elas
-- guardam uma etapa fixa na configuração ("ao detectar intenção de compra, mover
-- para X"); com dois funis, isso arrastaria negócio do funil B para o A. A
-- função passa a recusar etapa de outro funil, a menos que quem chama peça a
-- troca de propósito (p_trocar_funil), como a API quando recebe pipeline_id.
-- Negócio sem etapa não tem funil e aceita qualquer destino.
DROP FUNCTION IF EXISTS public.mover_negocio(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.mover_negocio(
  p_deal UUID,
  p_stage UUID,
  p_origem TEXT DEFAULT 'sistema',
  p_motivo TEXT DEFAULT NULL,
  p_trocar_funil BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage RECORD;
  v_funil_atual UUID;
  v_atualizado INTEGER;
BEGIN
  SELECT id, org_id, pipeline_id, win_probability INTO v_stage
  FROM public.pipeline_stages WHERE id = p_stage;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT COALESCE(p_trocar_funil, FALSE) THEN
    SELECT s.pipeline_id INTO v_funil_atual
      FROM public.deals d
      JOIN public.pipeline_stages s ON s.id = d.stage_id
     WHERE d.id = p_deal;
    IF v_funil_atual IS NOT NULL AND v_funil_atual <> v_stage.pipeline_id THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Vale só para esta transação: o trigger lê e a sessão não fica suja.
  PERFORM set_config('app.deal_origem', COALESCE(p_origem, 'sistema'), true);
  PERFORM set_config('app.deal_motivo', COALESCE(p_motivo, ''), true);

  UPDATE public.deals
  SET stage_id = v_stage.id,
      probability = v_stage.win_probability,
      updated_at = now()
  WHERE id = p_deal
    AND org_id = v_stage.org_id
    AND status = 'open';
  GET DIAGNOSTICS v_atualizado = ROW_COUNT;

  PERFORM set_config('app.deal_origem', '', true);
  PERFORM set_config('app.deal_motivo', '', true);
  RETURN v_atualizado > 0;
END;
$$;

-- Só as functions (service role) chamam: o front atualiza deals direto.
REVOKE ALL ON FUNCTION public.mover_negocio(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mover_negocio(UUID, UUID, TEXT, TEXT, BOOLEAN) TO service_role;
