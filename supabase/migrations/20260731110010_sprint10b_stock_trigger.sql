-- Sprint 10B-6b — Movimento de estoque por status de deal.
--
-- Ganhou → decrementa o estoque dos produtos rastreados do deal; deixou de
-- ser ganho (reaberto ou marcado perdido depois) → recompõe. Produtos com
-- stock_quantity NULL são ilimitados (serviços) e ficam fora.
--
-- Alerta de estoque baixo: dispara UMA vez, no decremento que cruza o mínimo
-- (antes >= mínimo, depois < mínimo) — não a cada venda abaixo da linha.
-- Exception handler: estoque nunca derruba a mudança de status do negócio.

CREATE OR REPLACE FUNCTION public.adjust_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          record;
  v_delta    integer;
  v_novo     integer;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'won' THEN
    v_delta := -1;
  ELSIF OLD.status = 'won' THEN
    v_delta := 1;
  ELSE
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT dp.product_id, COALESCE(dp.quantity, 1) AS quantity,
           p.stock_quantity, p.stock_minimum_alert, p.name
      FROM deal_products dp
      JOIN products p ON p.id = dp.product_id
     WHERE dp.deal_id = NEW.id
       AND p.track_stock
       AND p.stock_quantity IS NOT NULL
  LOOP
    v_novo := GREATEST(0, r.stock_quantity + v_delta * r.quantity);

    UPDATE products
       SET stock_quantity = v_novo,
           updated_at = now()
     WHERE id = r.product_id;

    IF v_delta = -1
       AND r.stock_minimum_alert IS NOT NULL
       AND v_novo < r.stock_minimum_alert
       AND r.stock_quantity >= r.stock_minimum_alert THEN
      PERFORM notify_org_admins(
        NEW.org_id,
        'estoque_baixo',
        'Estoque baixo',
        format('%s ficou com %s unidade(s) em estoque (mínimo: %s).', r.name, v_novo, r.stock_minimum_alert),
        'product',
        r.product_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_adjust_product_stock ON public.deals;
CREATE TRIGGER trg_adjust_product_stock
  AFTER UPDATE OF status ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.adjust_product_stock();
