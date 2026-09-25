-- Estresse de concorrência (25/09/2026): cinco envios simultâneos do mesmo
-- formulário, com o mesmo e-mail, viravam cinco contatos. O SELECT-e-INSERT das
-- functions não segura corrida; o banco segura. Mesmo desenho do índice do
-- WhatsApp (uniq_contact_whatsapp_por_org): um e-mail por organização entre os
-- contatos vivos (não fundidos). As functions tratam a violação (23505)
-- relendo o contato que ganhou a corrida.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contact_email_por_org
  ON public.contacts (org_id, lower(email))
  WHERE email IS NOT NULL AND merged_into_id IS NULL;
