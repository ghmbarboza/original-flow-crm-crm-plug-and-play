-- Um contato por telefone de WhatsApp dentro da organização.
--
-- O webhook fazia SELECT-e-depois-INSERT. Numa rajada de mensagens, as
-- invocações rodam em paralelo: todas consultam antes de qualquer INSERT
-- terminar, e todas criam um contato novo. Aconteceu em produção — seis
-- mensagens seguidas do mesmo número geraram SETE contatos, e o relatório
-- passou a contar sete leads onde havia uma pessoa.
--
-- O índice é parcial de propósito: contato mesclado (merged_into_id) mantém o
-- telefone para o histórico e não pode disputar a unicidade com quem o
-- absorveu.
create unique index if not exists uniq_contact_whatsapp_por_org
  on public.contacts (org_id, whatsapp_phone)
  where whatsapp_phone is not null and merged_into_id is null;
