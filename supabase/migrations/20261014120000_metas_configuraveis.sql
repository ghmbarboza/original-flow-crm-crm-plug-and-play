-- 14/10/2026: metas configuráveis (período livre, métricas novas, filtros).

-- 1. Data em que o negócio foi ganho ou perdido ---------------------------------
-- As metas contavam receita pela data da última edição (updated_at): editar um
-- negócio ganho em agosto, em outubro, levava a receita para outubro. closed_at
-- guarda o momento em que o status virou ganho ou perdido, e volta a nulo se o
-- negócio for reaberto.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Negócios já fechados: a melhor aproximação disponível é a última edição.
UPDATE public.deals SET closed_at = updated_at
 WHERE status IN ('won', 'lost') AND closed_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_deal_closed_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('won', 'lost') THEN
    IF TG_OP = 'INSERT' THEN
      -- Importação manda a data real; sem ela, a criação do negócio é melhor
      -- palpite que "agora" (um ganho de 2024 importado hoje não é receita de hoje).
      NEW.closed_at := COALESCE(NEW.closed_at, NEW.created_at, now());
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      -- Acabou de ganhar ou perder; se quem atualizou mandou a data, vale a dela.
      NEW.closed_at := CASE WHEN NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN COALESCE(NEW.closed_at, now()) ELSE now() END;
    ELSE
      NEW.closed_at := COALESCE(NEW.closed_at, OLD.closed_at, now());
    END IF;
  ELSE
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_deal_closed_at ON public.deals;
CREATE TRIGGER trg_deal_closed_at BEFORE INSERT OR UPDATE OF status, closed_at ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_deal_closed_at();

CREATE INDEX IF NOT EXISTS idx_deals_org_closed_at ON public.deals (org_id, closed_at) WHERE closed_at IS NOT NULL;

-- 2. Meta configurável ----------------------------------------------------------
ALTER TABLE public.sales_goals
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS period_kind TEXT NOT NULL DEFAULT 'mes',
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS filters JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Metas existentes eram sempre de um mês.
UPDATE public.sales_goals
   SET period_start = make_date(period_year, period_month, 1),
       period_end = (make_date(period_year, period_month, 1) + interval '1 month' - interval '1 day')::date
 WHERE period_start IS NULL;

-- Quem ainda grava só mês e ano (dados de demonstração) ganha o período do mês.
CREATE OR REPLACE FUNCTION public.tg_sales_goal_periodo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.period_start IS NULL THEN
    NEW.period_start := make_date(NEW.period_year, NEW.period_month, 1);
    NEW.period_end := (NEW.period_start + interval '1 month' - interval '1 day')::date;
  END IF;
  -- Mês e ano acompanham o início, para quem ainda lê por eles.
  NEW.period_month := extract(month FROM NEW.period_start)::int;
  NEW.period_year := extract(year FROM NEW.period_start)::int;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sales_goal_periodo ON public.sales_goals;
CREATE TRIGGER trg_sales_goal_periodo BEFORE INSERT OR UPDATE ON public.sales_goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_sales_goal_periodo();

ALTER TABLE public.sales_goals ALTER COLUMN period_start SET NOT NULL;
ALTER TABLE public.sales_goals ALTER COLUMN period_end SET NOT NULL;

ALTER TABLE public.sales_goals DROP CONSTRAINT IF EXISTS sales_goals_periodo_valido;
ALTER TABLE public.sales_goals ADD CONSTRAINT sales_goals_periodo_valido CHECK (period_end >= period_start);

ALTER TABLE public.sales_goals DROP CONSTRAINT IF EXISTS sales_goals_period_kind_check;
ALTER TABLE public.sales_goals ADD CONSTRAINT sales_goals_period_kind_check
  CHECK (period_kind IN ('semana', 'mes', 'trimestre', 'semestre', 'ano', 'personalizado'));

-- O CHECK antigo só aceitava 4 métricas: as metas por critério (taxa de
-- conversão, valor mínimo, tempo de resposta) eram recusadas pelo banco.
ALTER TABLE public.sales_goals DROP CONSTRAINT IF EXISTS sales_goals_goal_type_check;
ALTER TABLE public.sales_goals ADD CONSTRAINT sales_goals_goal_type_check CHECK (goal_type IN (
  'revenue', 'deals', 'deals_created', 'avg_ticket', 'min_deal_value',
  'contacts', 'activities', 'conversion_rate', 'lead_to_deal', 'avg_response_time'
));

CREATE INDEX IF NOT EXISTS idx_sales_goals_org_periodo ON public.sales_goals (org_id, period_start, period_end);
