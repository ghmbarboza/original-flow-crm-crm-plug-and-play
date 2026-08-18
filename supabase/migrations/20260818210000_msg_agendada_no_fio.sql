-- Marca no chat as mensagens que saíram de um agendamento.
--
-- O dispatcher gravava a mensagem no fio como qualquer outra, e ela ficava
-- indistinguível de algo que o agente acabou de digitar. Quem abria a conversa
-- não tinha como saber que aquilo foi programado dias antes — nem que o envio
-- automático de fato aconteceu.
alter table public.conversation_messages
  add column if not exists scheduled_message_id uuid
  references public.scheduled_messages(id) on delete set null;

comment on column public.conversation_messages.scheduled_message_id is
  'Preenchido quando a mensagem saiu de um agendamento; o chat marca essas mensagens como programadas.';

create index if not exists idx_conv_msg_scheduled
  on public.conversation_messages(scheduled_message_id)
  where scheduled_message_id is not null;
