-- Sprint 10A-1 — Índices para a timeline da ficha do contato.
--
-- Anotações não precisam de schema novo: já usam activities.type = 'note'.
-- Estes índices servem a leitura do histórico por contato, que a página
-- /contacts/:id faz em toda visita (activities + emails ordenados por data).

CREATE INDEX IF NOT EXISTS idx_activities_contact_created
  ON public.activities(contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emails_contact
  ON public.emails(contact_id, sent_at DESC)
  WHERE contact_id IS NOT NULL;
