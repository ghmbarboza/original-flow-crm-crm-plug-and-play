-- =====================================================
-- FlowCRM 2.0 — Pipeline padrão por organização
--
-- Sem pipeline e etapas, o Kanban de /deals abre sem nenhuma coluna e o CRM
-- nasce inutilizável. A organização já chega com um pipeline default utilizável,
-- criado por trigger para que qualquer remix novo funcione sem passo manual.
--
-- As cores das etapas vêm de VIA_STAGE_COLORS (src/lib/via-colors.ts) — este é
-- um dos poucos lugares onde o hex aparece fora daquele arquivo, porque é dado
-- e não estilo. Mantenha os dois lados em sincronia.
-- =====================================================

CREATE OR REPLACE FUNCTION public.seed_default_pipeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pipeline_id UUID;
BEGIN
  INSERT INTO public.pipelines (org_id, name, is_default)
  VALUES (NEW.id, 'Pipeline principal', true)
  RETURNING id INTO _pipeline_id;

  INSERT INTO public.pipeline_stages (org_id, pipeline_id, name, color, win_probability, "order") VALUES
    (NEW.id, _pipeline_id, 'Prospecção',   '#0A1F3B', 10,  0),
    (NEW.id, _pipeline_id, 'Qualificação', '#1E3A5F', 25,  1),
    (NEW.id, _pipeline_id, 'Proposta',     '#2A4A6E', 50,  2),
    (NEW.id, _pipeline_id, 'Negociação',   '#667085', 75,  3),
    (NEW.id, _pipeline_id, 'Fechamento',   '#1F8A5B', 100, 4);

  INSERT INTO public.loss_reasons (org_id, label, "order") VALUES
    (NEW.id, 'Preço',                    0),
    (NEW.id, 'Escolheu concorrente',     1),
    (NEW.id, 'Sem orçamento',            2),
    (NEW.id, 'Sem resposta',             3),
    (NEW.id, 'Fora do perfil',           4),
    (NEW.id, 'Timing inadequado',        5);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_default_pipeline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_organization_created_seed_pipeline ON public.organizations;
CREATE TRIGGER on_organization_created_seed_pipeline
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_pipeline();

-- Backfill: organizações criadas antes deste trigger (ex.: a org do primeiro
-- usuário, criada na migration de fundação) também precisam do pipeline.
DO $$
DECLARE
  _org RECORD;
  _pipeline_id UUID;
BEGIN
  FOR _org IN
    SELECT o.id FROM public.organizations o
    WHERE NOT EXISTS (SELECT 1 FROM public.pipelines p WHERE p.org_id = o.id)
  LOOP
    INSERT INTO public.pipelines (org_id, name, is_default)
    VALUES (_org.id, 'Pipeline principal', true)
    RETURNING id INTO _pipeline_id;

    INSERT INTO public.pipeline_stages (org_id, pipeline_id, name, color, win_probability, "order") VALUES
      (_org.id, _pipeline_id, 'Prospecção',   '#0A1F3B', 10,  0),
      (_org.id, _pipeline_id, 'Qualificação', '#1E3A5F', 25,  1),
      (_org.id, _pipeline_id, 'Proposta',     '#2A4A6E', 50,  2),
      (_org.id, _pipeline_id, 'Negociação',   '#667085', 75,  3),
      (_org.id, _pipeline_id, 'Fechamento',   '#1F8A5B', 100, 4);

    INSERT INTO public.loss_reasons (org_id, label, "order") VALUES
      (_org.id, 'Preço',                0),
      (_org.id, 'Escolheu concorrente', 1),
      (_org.id, 'Sem orçamento',        2),
      (_org.id, 'Sem resposta',         3),
      (_org.id, 'Fora do perfil',       4),
      (_org.id, 'Timing inadequado',    5);
  END LOOP;
END $$;
