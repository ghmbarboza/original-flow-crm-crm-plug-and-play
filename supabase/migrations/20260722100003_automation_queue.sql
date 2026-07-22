-- Sprint 6 — Enfileiramento de automações.
--
-- Triggers de banco que ENFILEIRAM automações em public.automation_logs quando
-- ocorrem os eventos de gatilho, para depois serem processadas pela edge function
-- `automation-dispatcher`. Nada de HTTP/pg_net aqui: só SQL puro. Cada log
-- enfileirado nasce com status 'queued' e carrega o `trigger_data` do evento.
--
-- Cada trigger tem exception handler que faz `raise warning` e retorna, para
-- NUNCA derrubar a operação de negócio por causa do enfileiramento (mesmo padrão
-- da migration 20260722100002_notification_producers.sql).

-- ---------------------------------------------------------------------------
-- Helper central: para cada automação ativa do org cujo trigger->>'type' bate
-- com p_trigger_type, insere um automation_logs 'queued' com o trigger_data.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_automations(
  p_org uuid,
  p_trigger_type text,
  p_trigger_data jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org is null or p_trigger_type is null then
    return;
  end if;

  insert into automation_logs (automation_id, org_id, status, trigger_data)
  select a.id, a.org_id, 'queued', coalesce(p_trigger_data, '{}'::jsonb)
  from automations a
  where a.org_id = p_org
    and a.is_active
    and a.trigger ->> 'type' = p_trigger_type;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilho 1 — contact_created (INSERT em contacts).
-- ---------------------------------------------------------------------------
create or replace function public.tg_enqueue_contact_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform enqueue_automations(new.org_id, 'contact_created', to_jsonb(new));
  return new;
exception when others then
  raise warning 'tg_enqueue_contact_created falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_contact_created on public.contacts;
create trigger trg_enqueue_contact_created
  after insert on public.contacts
  for each row execute function public.tg_enqueue_contact_created();

-- ---------------------------------------------------------------------------
-- Gatilho 2 — deal_stage_changed (UPDATE de stage_id em deals).
-- ---------------------------------------------------------------------------
create or replace function public.tg_enqueue_deal_stage_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  perform enqueue_automations(new.org_id, 'deal_stage_changed', to_jsonb(new));
  return new;
exception when others then
  raise warning 'tg_enqueue_deal_stage_changed falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_deal_stage_changed on public.deals;
create trigger trg_enqueue_deal_stage_changed
  after update on public.deals
  for each row execute function public.tg_enqueue_deal_stage_changed();

-- ---------------------------------------------------------------------------
-- Gatilho 3 — message_received (INSERT em whatsapp_messages).
-- Só mensagens REALMENTE recebidas do contato: direction = 'inbound', e nunca
-- notas internas nem mensagens geradas pela IA.
-- ---------------------------------------------------------------------------
create or replace function public.tg_enqueue_message_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction <> 'inbound'
     or new.is_internal_note = true
     or new.is_from_ai = true then
    return new;
  end if;

  perform enqueue_automations(new.org_id, 'message_received', to_jsonb(new));
  return new;
exception when others then
  raise warning 'tg_enqueue_message_received falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_message_received on public.whatsapp_messages;
create trigger trg_enqueue_message_received
  after insert on public.whatsapp_messages
  for each row execute function public.tg_enqueue_message_received();

-- ---------------------------------------------------------------------------
-- Gatilho 4 — tag_added (INSERT em contact_tags).
-- contact_tags não tem org_id; resolvemos via o contato. O trigger_data carrega
-- explicitamente contact_id e tag_id (a linha inserida não tem mais campos).
-- ---------------------------------------------------------------------------
create or replace function public.tg_enqueue_tag_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select c.org_id into v_org
  from contacts c
  where c.id = new.contact_id;

  if v_org is null then
    return new;
  end if;

  perform enqueue_automations(
    v_org,
    'tag_added',
    jsonb_build_object('contact_id', new.contact_id, 'tag_id', new.tag_id)
  );
  return new;
exception when others then
  raise warning 'tg_enqueue_tag_added falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_tag_added on public.contact_tags;
create trigger trg_enqueue_tag_added
  after insert on public.contact_tags
  for each row execute function public.tg_enqueue_tag_added();

-- form_submitted NÃO tem trigger aqui: esse evento é enfileirado diretamente pela
-- edge function `submit-capture-form` ao criar contato+deal a partir do formulário.
