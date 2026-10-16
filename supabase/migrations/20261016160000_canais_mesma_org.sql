-- Contas de canal: a conta de uma conversa e a instância de uma conta precisam
-- ser da mesma organização (revisão de segurança de 16/10/2026).
--
-- A RLS de conversations deixa qualquer membro gravar channel_account_id, e o
-- FK aceitava o id de uma conta de outra empresa. Como as functions leem as
-- credenciais da conta com service role, a conversa passaria a sair pelo
-- número de outra org. O helper _shared/canal.ts já confere a org; aqui fica a
-- garantia no banco, para valer também para quem escrever direto na tabela.
-- O mesmo vale para channel_accounts apontando para evolution_configs ou
-- meta_configs de outra org (e ocupando, pelo UNIQUE global, a vaga da conta
-- legítima dessa instância).

CREATE OR REPLACE FUNCTION public.conversa_conta_mesma_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
BEGIN
  IF NEW.channel_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO _org FROM public.channel_accounts WHERE id = NEW.channel_account_id;
  IF _org IS NULL OR _org <> NEW.org_id THEN
    RAISE EXCEPTION 'A conta de canal não pertence a esta organização'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_conversa_conta_mesma_org ON public.conversations;
CREATE TRIGGER tg_conversa_conta_mesma_org
  BEFORE INSERT OR UPDATE OF channel_account_id, org_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.conversa_conta_mesma_org();

CREATE OR REPLACE FUNCTION public.conta_canal_config_mesma_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
BEGIN
  IF NEW.evolution_config_id IS NOT NULL THEN
    SELECT org_id INTO _org FROM public.evolution_configs WHERE id = NEW.evolution_config_id;
    IF _org IS NULL OR _org <> NEW.org_id THEN
      RAISE EXCEPTION 'A instância Evolution não pertence a esta organização' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.meta_config_id IS NOT NULL THEN
    SELECT org_id INTO _org FROM public.meta_configs WHERE id = NEW.meta_config_id;
    IF _org IS NULL OR _org <> NEW.org_id THEN
      RAISE EXCEPTION 'O número da Meta não pertence a esta organização' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_conta_canal_config_mesma_org ON public.channel_accounts;
CREATE TRIGGER tg_conta_canal_config_mesma_org
  BEFORE INSERT OR UPDATE OF evolution_config_id, meta_config_id, org_id ON public.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public.conta_canal_config_mesma_org();
