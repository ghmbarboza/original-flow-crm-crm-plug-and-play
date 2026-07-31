-- Sprint 10A-4 — Campos obrigatórios por etapa do pipeline.
--
-- Formato do JSONB: [{"field": "contact.email"}, {"field": "deal.value", "min": 1}]
-- A validação acontece no cliente ao mover o deal (kanban ou edição manual);
-- o banco só guarda a regra.

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS required_fields JSONB DEFAULT '[]';
