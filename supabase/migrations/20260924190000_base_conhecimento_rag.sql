-- Sprint 12 B10: base de conhecimento com busca híbrida (24/09/2026).
--
-- Porte do RAG da Nina Zernio (full-text pt-BR + trigram, sem embeddings) para
-- o modelo multi-tenant do CRM. Documentos viram chunks; fatos canônicos com
-- status e validade entram no prompt quando always_include; FAQs e objeções
-- (tabelas já existentes) passam a ser recuperadas pela mesma busca em vez de
-- irem inteiras no prompt. Perguntas que a IA não soube responder ficam em
-- unanswered_questions para virar fato ou FAQ.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Documentos (materiais): texto colado, arquivo extraído no navegador ou URL.
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  doc_type TEXT NOT NULL DEFAULT 'texto' CHECK (doc_type IN ('texto', 'arquivo', 'url', 'faq')),
  source_url TEXT,
  file_name TEXT,
  fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('processing', 'approved', 'needs_review', 'error', 'archived')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  ingestion_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_documents_org" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_org" ON public.knowledge_documents
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_org_fingerprint_unique
  ON public.knowledge_documents (org_id, fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS knowledge_documents_org_status_idx
  ON public.knowledge_documents (org_id, status, updated_at DESC);

-- Chunks: cerca de 1200 caracteres, fts gerado em português.
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_chunks_org" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_org" ON public.knowledge_chunks
  FOR SELECT USING (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx ON public.knowledge_chunks (org_id, document_id, chunk_index);
CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx ON public.knowledge_chunks USING gin (fts);
CREATE INDEX IF NOT EXISTS knowledge_chunks_trgm_idx ON public.knowledge_chunks USING gin (content gin_trgm_ops);

-- Fatos canônicos: preço, prazo, endereço, política. always_include vai no prompt.
CREATE TABLE IF NOT EXISTS public.knowledge_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  question TEXT,
  fact TEXT NOT NULL,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'needs_review', 'expired', 'archived')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  always_include BOOLEAN NOT NULL DEFAULT true,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(question, '') || ' ' || fact)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_facts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_facts_org" ON public.knowledge_facts;
CREATE POLICY "knowledge_facts_org" ON public.knowledge_facts
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS knowledge_facts_org_status_idx ON public.knowledge_facts (org_id, status, category, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_facts_fts_idx ON public.knowledge_facts USING gin (fts);
CREATE INDEX IF NOT EXISTS knowledge_facts_trgm_idx ON public.knowledge_facts USING gin (fact gin_trgm_ops);

-- FAQs e objeções ganham fts + trigram para entrar na mesma busca.
ALTER TABLE public.ai_knowledge_faqs
  ADD COLUMN IF NOT EXISTS fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese', question || ' ' || answer)) STORED;
ALTER TABLE public.ai_knowledge_objections
  ADD COLUMN IF NOT EXISTS fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese', objection || ' ' || response)) STORED;
CREATE INDEX IF NOT EXISTS ai_knowledge_faqs_fts_idx ON public.ai_knowledge_faqs USING gin (fts);
CREATE INDEX IF NOT EXISTS ai_knowledge_faqs_trgm_idx ON public.ai_knowledge_faqs USING gin (question gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ai_knowledge_objections_fts_idx ON public.ai_knowledge_objections USING gin (fts);
CREATE INDEX IF NOT EXISTS ai_knowledge_objections_trgm_idx ON public.ai_knowledge_objections USING gin (objection gin_trgm_ops);

-- Perguntas que a IA não soube responder.
CREATE TABLE IF NOT EXISTS public.unanswered_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  kind TEXT NOT NULL DEFAULT 'question' CHECK (kind IN ('question', 'conflict', 'unreadable_document', 'expired_fact')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_fact_id UUID REFERENCES public.knowledge_facts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unanswered_questions_org" ON public.unanswered_questions;
CREATE POLICY "unanswered_questions_org" ON public.unanswered_questions
  FOR ALL USING (user_belongs_to_org(org_id)) WITH CHECK (user_belongs_to_org(org_id));
CREATE INDEX IF NOT EXISTS unanswered_questions_org_status_idx ON public.unanswered_questions (org_id, status, kind, created_at DESC);

-- Busca híbrida em fatos, chunks, FAQs e objeções:
--  * full-text pt-BR com todas as palavras (peso maior) e com qualquer palavra
--    (tolera pergunta longa em que só parte aparece no texto);
--  * word_similarity da consulta contra o melhor pedaço do texto (tolera erro
--    de digitação e acento; similarity simples ficava baixa para pergunta curta
--    contra trecho longo).
-- Chamada pelas functions (service role) e pela tela de teste (usuário da org).
CREATE OR REPLACE FUNCTION public.buscar_conhecimento(p_org UUID, p_consulta TEXT, p_limite INTEGER DEFAULT 6)
RETURNS TABLE(source_type TEXT, source_id UUID, title TEXT, content TEXT, rank REAL)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_texto TEXT := left(coalesce(p_consulta, ''), 300);
  v_and TSQUERY;
  v_or TSQUERY;
BEGIN
  IF auth.uid() IS NOT NULL AND p_org IS DISTINCT FROM public.current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para buscar nesta organização' USING ERRCODE = '42501';
  END IF;
  v_and := websearch_to_tsquery('portuguese', v_texto);
  SELECT to_tsquery('portuguese', string_agg(w, ' | '))
    INTO v_or
    FROM regexp_split_to_table(regexp_replace(v_texto, '[^[:alnum:][:space:]]', ' ', 'g'), '\s+') AS w
   WHERE length(w) > 2;
  IF v_or IS NULL THEN v_or := v_and; END IF;

  RETURN QUERY
  WITH fatos AS (
    SELECT 'fact'::TEXT, f.id, f.title, f.fact,
           (coalesce(ts_rank(f.fts, v_and), 0) * 3.0 + coalesce(ts_rank(f.fts, v_or), 0) * 1.5
            + word_similarity(v_texto, coalesce(f.title, '') || ' ' || coalesce(f.question, '') || ' ' || f.fact) * 1.5)::REAL
    FROM public.knowledge_facts f
    WHERE f.org_id = p_org AND f.status = 'confirmed' AND f.is_active
      AND f.valid_from <= now() AND (f.expires_at IS NULL OR f.expires_at > now())
      AND (f.fts @@ v_or OR word_similarity(v_texto, coalesce(f.title, '') || ' ' || coalesce(f.question, '') || ' ' || f.fact) > 0.3)
  ),
  chunks AS (
    SELECT 'chunk'::TEXT, c.id, d.title, c.content,
           (coalesce(ts_rank(c.fts, v_and), 0) * 2.0 + coalesce(ts_rank(c.fts, v_or), 0) + word_similarity(v_texto, c.content))::REAL
    FROM public.knowledge_chunks c
    JOIN public.knowledge_documents d ON d.id = c.document_id AND d.status = 'approved' AND d.is_active
    WHERE c.org_id = p_org AND (c.fts @@ v_or OR word_similarity(v_texto, c.content) > 0.3)
  ),
  faqs AS (
    SELECT 'faq'::TEXT, f.id, f.question, f.answer,
           (coalesce(ts_rank(f.fts, v_and), 0) * 2.5 + coalesce(ts_rank(f.fts, v_or), 0) * 1.2 + word_similarity(v_texto, f.question || ' ' || f.answer) * 1.2)::REAL
    FROM public.ai_knowledge_faqs f
    WHERE f.org_id = p_org AND (f.fts @@ v_or OR word_similarity(v_texto, f.question || ' ' || f.answer) > 0.3)
  ),
  objecoes AS (
    SELECT 'objection'::TEXT, o.id, o.objection, o.response,
           (coalesce(ts_rank(o.fts, v_and), 0) * 2.5 + coalesce(ts_rank(o.fts, v_or), 0) * 1.2 + word_similarity(v_texto, o.objection || ' ' || o.response) * 1.2)::REAL
    FROM public.ai_knowledge_objections o
    WHERE o.org_id = p_org AND (o.fts @@ v_or OR word_similarity(v_texto, o.objection || ' ' || o.response) > 0.3)
  )
  SELECT * FROM (
    SELECT * FROM fatos UNION ALL SELECT * FROM chunks UNION ALL SELECT * FROM faqs UNION ALL SELECT * FROM objecoes
  ) hits(source_type, source_id, title, content, rank)
  ORDER BY hits.rank DESC
  LIMIT least(greatest(coalesce(p_limite, 6), 1), 50);
END;
$$;
REVOKE ALL ON FUNCTION public.buscar_conhecimento(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_conhecimento(UUID, TEXT, INTEGER) TO authenticated, service_role;

-- Grava (ou regrava) um documento com seus chunks numa transação. Idempotente
-- por fingerprint: mandar o mesmo conteúdo duas vezes devolve o mesmo documento.
CREATE OR REPLACE FUNCTION public.gravar_documento_conhecimento(
  p_document_id UUID,
  p_title TEXT,
  p_content TEXT,
  p_doc_type TEXT,
  p_source_url TEXT,
  p_file_name TEXT,
  p_fingerprint TEXT,
  p_status TEXT,
  p_ingestion_report JSONB,
  p_error_message TEXT,
  p_chunks TEXT[]
)
RETURNS public.knowledge_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.current_org_id();
  v_doc public.knowledge_documents;
  v_total INTEGER := coalesce(array_length(p_chunks, 1), 0);
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Usuário sem organização' USING ERRCODE = '42501';
  END IF;
  IF coalesce(char_length(trim(p_title)), 0) = 0 THEN
    RAISE EXCEPTION 'O título do material é obrigatório' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_content, '')) > 220000 OR v_total > 500 THEN
    RAISE EXCEPTION 'O material passa do limite (220 mil caracteres ou 500 trechos)' USING ERRCODE = '22023';
  END IF;
  IF p_doc_type NOT IN ('texto', 'arquivo', 'url', 'faq')
     OR p_status NOT IN ('processing', 'approved', 'needs_review', 'error', 'archived') THEN
    RAISE EXCEPTION 'Tipo ou status de material inválido' USING ERRCODE = '22023';
  END IF;

  -- Duas chamadas simultâneas com o mesmo conteúdo (duplo clique, duas abas) esperam uma pela outra.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text || coalesce(p_fingerprint, ''), 0));
  IF p_document_id IS NULL THEN
    IF p_fingerprint IS NOT NULL THEN
      SELECT * INTO v_doc FROM public.knowledge_documents d WHERE d.org_id = v_org AND d.fingerprint = p_fingerprint LIMIT 1;
      IF v_doc.id IS NOT NULL THEN RETURN v_doc; END IF;
    END IF;
    INSERT INTO public.knowledge_documents (org_id, title, content, doc_type, source_url, file_name, fingerprint, status, is_active, ingestion_report, error_message, chunk_count, created_by)
    VALUES (v_org, trim(p_title), coalesce(p_content, ''), p_doc_type, nullif(trim(coalesce(p_source_url, '')), ''), nullif(trim(coalesce(p_file_name, '')), ''),
            p_fingerprint, p_status, p_status = 'approved', coalesce(p_ingestion_report, '{}'::jsonb), nullif(trim(coalesce(p_error_message, '')), ''), v_total, auth.uid())
    RETURNING * INTO v_doc;
  ELSE
    SELECT * INTO v_doc FROM public.knowledge_documents d WHERE d.id = p_document_id AND d.org_id = v_org FOR UPDATE;
    IF v_doc.id IS NULL THEN
      RAISE EXCEPTION 'Material não encontrado' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.knowledge_documents
       SET title = trim(p_title), content = coalesce(p_content, ''), doc_type = p_doc_type,
           source_url = nullif(trim(coalesce(p_source_url, '')), ''), file_name = nullif(trim(coalesce(p_file_name, '')), ''),
           fingerprint = p_fingerprint, status = p_status, is_active = (p_status = 'approved'),
           ingestion_report = coalesce(p_ingestion_report, '{}'::jsonb), error_message = nullif(trim(coalesce(p_error_message, '')), ''),
           chunk_count = v_total, updated_at = now()
     WHERE id = v_doc.id
     RETURNING * INTO v_doc;
    DELETE FROM public.knowledge_chunks WHERE document_id = v_doc.id;
  END IF;

  IF v_total > 0 THEN
    INSERT INTO public.knowledge_chunks (org_id, document_id, chunk_index, content)
    SELECT v_org, v_doc.id, ordinal - 1, trecho
      FROM unnest(p_chunks) WITH ORDINALITY AS t(trecho, ordinal);
  END IF;
  RETURN v_doc;
END;
$$;
REVOKE ALL ON FUNCTION public.gravar_documento_conhecimento(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_documento_conhecimento(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT[]) TO authenticated;

-- Aprovar/arquivar documento: status e is_active andam juntos.
CREATE OR REPLACE FUNCTION public.tg_knowledge_documents_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_active := (NEW.status = 'approved');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_knowledge_documents_status ON public.knowledge_documents;
CREATE TRIGGER tg_knowledge_documents_status BEFORE UPDATE OF status ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_knowledge_documents_status();
