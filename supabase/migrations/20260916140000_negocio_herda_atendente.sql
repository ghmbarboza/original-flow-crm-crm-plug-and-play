-- Negócio aberto por uma conversa herda o atendente como responsável.
--
-- Até aqui todo negócio criado pela conversa nascia sem owner_id (em 16/09
-- eram 24 de 24 em produção). Sem dono, ele não aparece em "meus negócios",
-- não conta na meta individual e é recusado pelo Painel Preditivo de Metas,
-- que identifica o corretor pelo e-mail do responsável.
--
-- Regra (prática comum de CRM): o responsável do negócio é quem atende a
-- conversa (conversations.assigned_to, definido pelo rodízio ou por quem
-- assumiu). Só preenche quando o negócio está SEM dono: transferir a conversa
-- não rouba um negócio que já tem responsável; trocar o dono é decisão
-- explícita na tela do negócio.
--
-- Gatilho na conversa, não no código de cada webhook: cobre Evolution, Meta,
-- Zernio, assumir e transferir pela tela, tudo num lugar só.
CREATE OR REPLACE FUNCTION public.negocio_herda_atendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.deals
     SET owner_id = NEW.assigned_to, updated_at = now()
   WHERE id = NEW.deal_id
     AND owner_id IS NULL
     AND status = 'open';
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca derruba a gravação da conversa por causa do dono do negócio.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_negocio_herda_atendente ON public.conversations;
CREATE TRIGGER trg_negocio_herda_atendente
  AFTER INSERT OR UPDATE OF assigned_to, deal_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.negocio_herda_atendente();

-- Negócios já abertos pela conversa e ainda sem dono.
UPDATE public.deals d
   SET owner_id = c.assigned_to, updated_at = now()
  FROM public.conversations c
 WHERE c.deal_id = d.id
   AND d.owner_id IS NULL
   AND d.status = 'open'
   AND c.assigned_to IS NOT NULL;
