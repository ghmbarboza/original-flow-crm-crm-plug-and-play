-- 25/09/2026: o Kanban de Negócios ficou vazio porque os negócios perderam a
-- etapa. O teste automático do onboarding "restaurava" as etapas apagando e
-- recriando todas, e o ON DELETE SET NULL de deals.stage_id deixava cada
-- negócio sem etapa (sumindo do Kanban, visível só na lista).
-- Trava no banco: etapa com negócio dentro não pode ser apagada. A tela de funil
-- não apaga etapa, e o onboarding só substitui etapas quando não há negócio.
CREATE OR REPLACE FUNCTION public.tg_etapa_com_negocio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.deals WHERE stage_id = OLD.id) THEN
    RAISE EXCEPTION 'A etapa "%" tem negócios. Mova os negócios para outra etapa antes de removê-la.', OLD.name
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_etapa_com_negocio ON public.pipeline_stages;
CREATE TRIGGER trg_etapa_com_negocio BEFORE DELETE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.tg_etapa_com_negocio();
