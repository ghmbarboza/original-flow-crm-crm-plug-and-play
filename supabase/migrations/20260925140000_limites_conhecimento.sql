-- Estresse de entradas (25/09/2026): um fato canônico de 50 mil caracteres foi
-- aceito, e fatos "sempre incluídos" entram inteiros no prompt da IA a cada
-- resposta. Documento aprovado sem conteúdo também passava. Limites no banco;
-- a tela mostra o contador e o prompt corta como reserva.
ALTER TABLE public.knowledge_facts
  ADD CONSTRAINT knowledge_facts_fato_tamanho CHECK (char_length(fact) BETWEEN 1 AND 2000),
  ADD CONSTRAINT knowledge_facts_pergunta_tamanho CHECK (question IS NULL OR char_length(question) <= 500),
  ADD CONSTRAINT knowledge_facts_titulo_tamanho CHECK (char_length(title) <= 200);

ALTER TABLE public.knowledge_documents
  ADD CONSTRAINT knowledge_documents_aprovado_com_conteudo CHECK (status <> 'approved' OR char_length(btrim(content)) > 0);
