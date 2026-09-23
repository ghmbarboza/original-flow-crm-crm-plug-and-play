-- Histórico automático do negócio + IA no funil + abordagem ativa (23/09/2026), parte 2 de 2.
--
-- O QUE MUDA
--  1. organizations.history_settings: o usuário decide, em Configurações, o que
--     entra na linha do tempo sozinho (mudança de etapa, ganho/perdido, por
--     quem) e se a IA deixa anotações.
--  2. ai_messaging_config.funnel_actions: se a IA pode mover o negócio de etapa,
--     se move sozinha ou só sugere, e para quais etapas.
--  3. ai_messaging_config.outreach: instrução de abertura e template (Meta e
--     Zernio exigem template aprovado para a primeira mensagem).
--  4. mover_negocio(): RPC que as functions usam para mover com origem e motivo.
--     O front continua atualizando deals direto; o trigger reconhece a pessoa
--     pelo auth.uid().
--  5. tg_log_deal_change: trigger em deals que grava a atividade 'stage_change'.
--     Um trigger, e não código em cada chamador, porque etapa muda pelo kanban,
--     pela lista, pela IA, pela automação e pelo webhook.

-- 1. Preferências de histórico ------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS history_settings JSONB NOT NULL DEFAULT '{
    "stage_changes": true,
    "status_changes": true,
    "origins": {"usuario": true, "ia": true, "automacao": true},
    "ai_notes": true
  }'::jsonb;

-- 2 e 3. Configuração da IA ---------------------------------------------------
ALTER TABLE public.ai_messaging_config
  ADD COLUMN IF NOT EXISTS funnel_actions JSONB NOT NULL DEFAULT '{
    "enabled": true,
    "mode": "auto",
    "allowed_stage_ids": []
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS outreach JSONB NOT NULL DEFAULT '{
    "instruction": "",
    "template_name": null,
    "template_language": "pt_BR"
  }'::jsonb;

-- 4. Mover negócio com origem e motivo ----------------------------------------
CREATE OR REPLACE FUNCTION public.mover_negocio(
  p_deal UUID,
  p_stage UUID,
  p_origem TEXT DEFAULT 'sistema',
  p_motivo TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage RECORD;
  v_atualizado INTEGER;
BEGIN
  SELECT id, org_id, win_probability INTO v_stage
  FROM public.pipeline_stages WHERE id = p_stage;
  IF NOT FOUND THEN
    RETURN FALSE;
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
REVOKE ALL ON FUNCTION public.mover_negocio(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mover_negocio(UUID, UUID, TEXT, TEXT) TO service_role;

-- 5. Trigger que grava a mudança na linha do tempo ------------------------------
CREATE OR REPLACE FUNCTION public.tg_log_deal_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg JSONB;
  v_origem TEXT;
  v_motivo TEXT;
  v_de TEXT;
  v_para TEXT;
  v_titulo TEXT;
  v_corpo TEXT;
  v_quem TEXT;
  v_user UUID;
BEGIN
  SELECT history_settings INTO v_cfg FROM public.organizations WHERE id = NEW.org_id;
  v_cfg := COALESCE(v_cfg, '{}'::jsonb);

  v_user := auth.uid();
  v_origem := NULLIF(current_setting('app.deal_origem', true), '');
  IF v_origem IS NULL THEN
    v_origem := CASE WHEN v_user IS NULL THEN 'automacao' ELSE 'usuario' END;
  END IF;
  -- 'sistema' (webhook, trigger de outra tabela) entra na mesma chave da automação.
  IF v_origem NOT IN ('usuario', 'ia', 'automacao') THEN
    v_origem := 'automacao';
  END IF;
  IF COALESCE((v_cfg -> 'origins' ->> v_origem)::boolean, true) = false THEN
    RETURN NEW;
  END IF;

  v_motivo := NULLIF(current_setting('app.deal_motivo', true), '');
  v_quem := CASE v_origem
    WHEN 'ia' THEN 'pela IA'
    WHEN 'automacao' THEN 'por automação'
    ELSE COALESCE((SELECT 'por ' || full_name FROM public.profiles WHERE id = v_user), 'pela equipe')
  END;

  -- Mudança de etapa.
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id
     AND COALESCE((v_cfg ->> 'stage_changes')::boolean, true) THEN
    SELECT name INTO v_de FROM public.pipeline_stages WHERE id = OLD.stage_id;
    SELECT name INTO v_para FROM public.pipeline_stages WHERE id = NEW.stage_id;
    v_titulo := 'Movido para ' || COALESCE(v_para, 'sem etapa');
    v_corpo := 'De ' || COALESCE(v_de, 'sem etapa') || ' para ' || COALESCE(v_para, 'sem etapa') || ', ' || v_quem
      || CASE WHEN v_motivo IS NULL THEN '.' ELSE '. Motivo: ' || v_motivo END;
    INSERT INTO public.activities (org_id, type, title, body, contact_id, deal_id, company_id, user_id, is_demo)
    VALUES (NEW.org_id, 'stage_change', v_titulo, v_corpo, NEW.contact_id, NEW.id, NEW.company_id, v_user, COALESCE(NEW.is_demo, false));
  END IF;

  -- Ganho, perdido ou reaberto.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE((v_cfg ->> 'status_changes')::boolean, true) THEN
    v_titulo := CASE NEW.status::text
      WHEN 'won' THEN 'Negócio ganho'
      WHEN 'lost' THEN 'Negócio perdido'
      ELSE 'Negócio reaberto'
    END;
    v_corpo := v_titulo || ' ' || v_quem
      || CASE WHEN v_motivo IS NULL THEN '.' ELSE '. Motivo: ' || v_motivo END;
    INSERT INTO public.activities (org_id, type, title, body, contact_id, deal_id, company_id, user_id, is_demo)
    VALUES (NEW.org_id, 'stage_change', v_titulo, v_corpo, NEW.contact_id, NEW.id, NEW.company_id, v_user, COALESCE(NEW.is_demo, false));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Histórico nunca impede o movimento.
  RAISE WARNING 'tg_log_deal_change falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_deal_change ON public.deals;
CREATE TRIGGER trg_log_deal_change
  AFTER UPDATE OF stage_id, status ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_deal_change();
