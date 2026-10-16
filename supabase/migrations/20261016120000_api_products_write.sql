-- Escopo products:write na API pública: POST /products cria ou atualiza produtos
-- (chave custom_fields.external_id ou nome), usado pela coleta de catálogos externos (ex.: HeroSpark).
-- Mesma função de 20260924140000_api_publica.sql, só com o escopo novo na lista.

CREATE OR REPLACE FUNCTION public.criar_chave_api(p_name TEXT, p_scopes TEXT[], p_rate_limit INTEGER DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org UUID;
  v_chave TEXT;
  v_id UUID;
  v_escopo TEXT;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM profiles WHERE id = auth.uid();
  IF v_org IS NULL THEN RAISE EXCEPTION 'Organização não encontrada'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Dê um nome para a chave (ex.: a ferramenta que vai usar)'; END IF;
  IF p_scopes IS NULL OR array_length(p_scopes, 1) IS NULL THEN RAISE EXCEPTION 'Escolha ao menos um escopo'; END IF;
  FOREACH v_escopo IN ARRAY p_scopes LOOP
    IF v_escopo NOT IN ('contacts:read','contacts:write','deals:read','deals:write','conversations:read','conversations:write',
                        'pipelines:read','activities:write','products:read','products:write','knowledge:read') THEN
      RAISE EXCEPTION 'Escopo desconhecido: %', v_escopo;
    END IF;
  END LOOP;

  v_chave := 'fcrm_live_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO api_keys (org_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute, created_by)
  VALUES (v_org, trim(p_name), left(v_chave, 18), encode(digest(v_chave, 'sha256'), 'hex'), p_scopes,
          GREATEST(10, LEAST(coalesce(p_rate_limit, 120), 3000)), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'key', v_chave);
END;
$$;
REVOKE ALL ON FUNCTION public.criar_chave_api(TEXT, TEXT[], INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_chave_api(TEXT, TEXT[], INTEGER) TO authenticated;

-- Um external_id por organização: duas chamadas simultâneas não criam o mesmo produto.
CREATE UNIQUE INDEX IF NOT EXISTS products_org_external_id_uq
  ON public.products (org_id, (custom_fields->>'external_id'))
  WHERE custom_fields ? 'external_id';
