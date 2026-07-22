-- Sprint 6 — Produtores de notificações in-app.
--
-- Funções + triggers de banco que inserem em public.notifications quando
-- ocorrem eventos de CRM, respeitando a preferência channel_in_app do usuário
-- (ausência de preferência = notificar). Cada trigger tem exception handler
-- para NUNCA derrubar a operação de negócio por causa de uma notificação.

-- ---------------------------------------------------------------------------
-- Função central: cria uma notificação in-app para um usuário, se a
-- preferência dele para o event_type não estiver explicitamente desligada.
-- ---------------------------------------------------------------------------
create or replace function public.create_notification(
  p_org uuid,
  p_user uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_org is null then
    return;
  end if;

  -- Opt-out explícito de in-app para este evento → não cria.
  if exists (
    select 1 from notification_preferences
    where user_id = p_user
      and event_type = p_event_type
      and channel_in_app = false
  ) then
    return;
  end if;

  insert into notifications (org_id, user_id, type, title, body, entity_type, entity_id)
  values (p_org, p_user, p_event_type, p_title, p_body, p_entity_type, p_entity_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Helper: notifica todos os admins ativos de um org.
-- ---------------------------------------------------------------------------
create or replace function public.notify_org_admins(
  p_org uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select p.id
    from profiles p
    join user_roles ur on ur.user_id = p.id
    where p.org_id = p_org
      and p.is_active
      and ur.role = 'admin'
  loop
    perform create_notification(p_org, r.id, p_event_type, p_title, p_body, p_entity_type, p_entity_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Evento 1 — Novo lead (INSERT em contacts).
-- Só tratamos como lead o que veio de captura pública (source='capture_form')
-- ou o que está marcado como status='lead', para não gerar ruído em
-- importações de contatos já existentes. Notifica o dono; se não houver, admins.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not (coalesce(new.source, '') = 'capture_form' or new.status = 'lead') then
    return new;
  end if;

  v_name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  if v_name = '' then
    v_name := coalesce(new.email, 'sem nome');
  end if;

  if new.owner_id is not null then
    perform create_notification(new.org_id, new.owner_id, 'novo_lead',
      'Novo lead: ' || v_name, null, 'contact', new.id);
  else
    perform notify_org_admins(new.org_id, 'novo_lead',
      'Novo lead: ' || v_name, null, 'contact', new.id);
  end if;

  return new;
exception when others then
  raise warning 'tg_notify_new_lead falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_lead on public.contacts;
create trigger trg_notify_new_lead
  after insert on public.contacts
  for each row execute function public.tg_notify_new_lead();

-- ---------------------------------------------------------------------------
-- Evento 2 — Negócio ganho/perdido (UPDATE de status em deals).
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_deal_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_title text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('won', 'lost') then
    return new;
  end if;

  if new.status = 'won' then
    v_type := 'deal_ganho';
    v_title := 'Negócio ganho: ' || new.title;
  else
    v_type := 'deal_perdido';
    v_title := 'Negócio perdido: ' || new.title;
  end if;

  if new.owner_id is not null then
    perform create_notification(new.org_id, new.owner_id, v_type, v_title, null, 'deal', new.id);
  else
    perform notify_org_admins(new.org_id, v_type, v_title, null, 'deal', new.id);
  end if;

  return new;
exception when others then
  raise warning 'tg_notify_deal_status falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_deal_status on public.deals;
create trigger trg_notify_deal_status
  after update on public.deals
  for each row execute function public.tg_notify_deal_status();

-- ---------------------------------------------------------------------------
-- Evento 3 — Tarefa atribuída (activities do tipo 'task' com responsável).
-- Dispara no INSERT com responsável, ou no UPDATE que muda o responsável.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type <> 'task' or new.user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
    return new;
  end if;

  perform create_notification(new.org_id, new.user_id, 'tarefa_atribuida',
    'Tarefa atribuída: ' || new.title, null, 'activity', new.id);

  return new;
exception when others then
  raise warning 'tg_notify_task_assigned falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_task_assigned on public.activities;
create trigger trg_notify_task_assigned
  after insert or update on public.activities
  for each row execute function public.tg_notify_task_assigned();

-- ---------------------------------------------------------------------------
-- Evento 4 — IA acionou humano (conversa de WhatsApp vira 'human_takeover').
-- Destinatário: responsável atribuído → membros do time → admins do org.
-- ---------------------------------------------------------------------------
create or replace function public.tg_notify_human_takeover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_body text;
  v_notified boolean := false;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'human_takeover' then
    return new;
  end if;

  v_body := 'A IA transferiu a conversa ' || coalesce(new.phone_number, '') ||
            ' para atendimento humano.';

  if new.assigned_to is not null then
    perform create_notification(new.org_id, new.assigned_to, 'ia_acionou_humano',
      'Atendimento humano solicitado', v_body, 'whatsapp_conversation', new.id);
    return new;
  end if;

  if new.team_id is not null then
    for r in
      select tm.user_id
      from team_members tm
      join profiles p on p.id = tm.user_id
      where tm.team_id = new.team_id and p.is_active
    loop
      perform create_notification(new.org_id, r.user_id, 'ia_acionou_humano',
        'Atendimento humano solicitado', v_body, 'whatsapp_conversation', new.id);
      v_notified := true;
    end loop;
    if v_notified then
      return new;
    end if;
  end if;

  perform notify_org_admins(new.org_id, 'ia_acionou_humano',
    'Atendimento humano solicitado', v_body, 'whatsapp_conversation', new.id);

  return new;
exception when others then
  raise warning 'tg_notify_human_takeover falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_human_takeover on public.whatsapp_conversations;
create trigger trg_notify_human_takeover
  after update on public.whatsapp_conversations
  for each row execute function public.tg_notify_human_takeover();
