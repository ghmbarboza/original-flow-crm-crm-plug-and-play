-- Assistente do CRM (25/09/2026): agente dentro do app que consulta os dados da
-- plataforma para responder, com links para as telas. As consultas rodam com o
-- JWT do usuário (RLS vale: cada um só vê o que já vê na tela). Aqui só a cota
-- de uso por pessoa por hora, para o custo de IA ter teto.
CREATE TABLE IF NOT EXISTS public.assistente_uso (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  janela TIMESTAMPTZ NOT NULL,
  usos INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, janela)
);
ALTER TABLE public.assistente_uso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assistente_uso_proprio" ON public.assistente_uso;
CREATE POLICY "assistente_uso_proprio" ON public.assistente_uso FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Conta uma pergunta do usuário logado na hora corrente. Falso quando passou do limite.
CREATE OR REPLACE FUNCTION public.consumir_cota_assistente(p_limite INTEGER DEFAULT 60)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_janela TIMESTAMPTZ := date_trunc('hour', now());
  v_usos INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  INSERT INTO assistente_uso (user_id, janela, usos) VALUES (auth.uid(), v_janela, 1)
  ON CONFLICT (user_id, janela) DO UPDATE SET usos = assistente_uso.usos + 1
  RETURNING usos INTO v_usos;
  DELETE FROM assistente_uso WHERE user_id = auth.uid() AND janela < now() - interval '2 days';
  RETURN v_usos <= least(greatest(coalesce(p_limite, 60), 1), 200);
END; $$;
REVOKE ALL ON FUNCTION public.consumir_cota_assistente(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consumir_cota_assistente(INTEGER) TO authenticated;
