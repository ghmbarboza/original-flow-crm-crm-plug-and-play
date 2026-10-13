-- 13/10/2026: as etapas do funil passam a ser editáveis na tela (criar, renomear,
-- reordenar, excluir). Reordenar grava a posição de todas as etapas de uma vez:
-- feito etapa a etapa pelo navegador, uma falha no meio deixaria duas etapas na
-- mesma posição e o Kanban em ordem imprevisível.
--
-- SECURITY INVOKER de propósito: quem chama só enxerga e altera as etapas da
-- própria organização, pela RLS de pipeline_stages.
CREATE OR REPLACE FUNCTION public.reorder_pipeline_stages(_pipeline_id uuid, _stage_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_iguais integer;
BEGIN
  SELECT count(*) INTO v_total FROM pipeline_stages WHERE pipeline_id = _pipeline_id;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Funil não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  -- A lista precisa ser exatamente as etapas do funil, cada uma uma vez.
  SELECT count(DISTINCT s.id) INTO v_iguais
    FROM pipeline_stages s
   WHERE s.pipeline_id = _pipeline_id AND s.id = ANY (_stage_ids);
  IF v_iguais <> v_total OR COALESCE(array_length(_stage_ids, 1), 0) <> v_total THEN
    RAISE EXCEPTION 'A lista de etapas não corresponde às etapas do funil.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE pipeline_stages s
     SET "order" = t.posicao - 1
    FROM unnest(_stage_ids) WITH ORDINALITY AS t(id, posicao)
   WHERE s.id = t.id AND s.pipeline_id = _pipeline_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_pipeline_stages(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_pipeline_stages(uuid, uuid[]) TO authenticated;
