// Dispatcher genérico de automações.
//
// Processa a fila em public.automation_logs (status='queued'), enfileirada pelos
// triggers de banco (migration 20260722100003_automation_queue.sql) e pela função
// submit-capture-form. Para cada log: reivindica de forma atômica, carrega a
// automação, avalia as condições contra o trigger_data e executa as ações.
//
// Não é acionado por usuário: roda pelo cron `automation-dispatch` (a cada minuto,
// migration 20260914100000) com o segredo interno. Usa service-role, mas SEMPRE
// escopa por org_id do log — nunca confia em dado de fora do org.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidAccessToken, type GmailConnection } from "../_shared/google.ts";
import { cronAutorizado, naoAutorizado } from "../_shared/seguranca.ts";
import { moverNegocio } from "../_shared/negocio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Json = Record<string, unknown>;

const BATCH_LIMIT = 50;

interface Condition {
  field: string;
  op: "eq" | "neq" | "contains";
  value: string;
}
interface Action {
  type: string;
  params: Record<string, string>;
}
interface ActionResult {
  type: string;
  ok: boolean;
  msg?: string;
}

/** Renderiza {{contact.first_name}} etc. contra um contexto aninhado. */
function renderTemplate(template: string, ctx: Record<string, Json | null>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const [root, field] = path.split(".");
    const obj = ctx[root];
    const value = obj ? obj[field] : undefined;
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Avalia UMA condição contra o trigger_data (comparação como string). */
function evalCondition(cond: Condition, data: Json): boolean {
  const raw = data[cond.field];
  const actual = raw === undefined || raw === null ? "" : String(raw);
  const expected = cond.value ?? "";
  switch (cond.op) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      return actual.toLowerCase().includes(expected.toLowerCase());
    default:
      return false;
  }
}

/** Todas as condições devem passar (AND). Array vazio/ausente = passa. */
function conditionsPass(conditions: unknown, data: Json): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((c) => {
    if (!c || typeof c !== "object") return true;
    const cond = c as Condition;
    if (typeof cond.field !== "string" || typeof cond.op !== "string") return true;
    return evalCondition(cond, data);
  });
}

/**
 * Resolve o contato e o deal envolvidos no evento, a partir do trigger_data e do
 * tipo de gatilho. Retorna ids (podem ser nulos) para as ações usarem.
 */
async function resolveEntities(
  admin: Admin,
  orgId: string,
  triggerType: string,
  data: Json,
): Promise<{ contactId: string | null; dealId: string | null }> {
  let contactId: string | null = null;
  let dealId: string | null = null;

  switch (triggerType) {
    case "contact_created":
      contactId = (data.id as string) ?? null;
      break;
    case "deal_stage_changed":
      dealId = (data.id as string) ?? null;
      contactId = (data.contact_id as string) ?? null;
      break;
    case "tag_added":
      contactId = (data.contact_id as string) ?? null;
      break;
    case "form_submitted":
      contactId = (data.contact_id as string) ?? null;
      dealId = (data.deal_id as string) ?? null;
      break;
    case "message_received": {
      const convId = (data.conversation_id as string) ?? null;
      if (convId) {
        const { data: conv } = await admin
          .from("conversations")
          .select("contact_id")
          .eq("id", convId)
          .eq("org_id", orgId)
          .maybeSingle();
        contactId = conv?.contact_id ?? null;
      }
      break;
    }
    default:
      contactId = (data.contact_id as string) ?? null;
      dealId = (data.deal_id as string) ?? null;
  }
  return { contactId, dealId };
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function actSendEmail(
  admin: Admin,
  orgId: string,
  params: Record<string, string>,
  ctx: { contactId: string | null; dealId: string | null; data: Json },
): Promise<ActionResult> {
  const templateId = params.template_id;
  if (!templateId) return { type: "send_email", ok: false, msg: "template_id ausente" };

  // Template (escopo do org).
  const { data: tpl } = await admin
    .from("email_templates")
    .select("subject, body_html")
    .eq("id", templateId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!tpl) return { type: "send_email", ok: false, msg: "template não encontrado no org" };

  // Contexto do contato/deal/empresa para renderizar as variáveis.
  let contact: Json | null = null;
  let deal: Json | null = null;
  let company: Json | null = null;
  if (ctx.contactId) {
    const { data: c } = await admin
      .from("contacts")
      .select("id, first_name, last_name, email, title, company_id, org_id")
      .eq("id", ctx.contactId)
      .eq("org_id", orgId)
      .maybeSingle();
    contact = c ?? null;
    if (c?.company_id) {
      const { data: co } = await admin
        .from("companies")
        .select("name")
        .eq("id", c.company_id)
        .eq("org_id", orgId)
        .maybeSingle();
      company = co ?? null;
    }
  }
  if (ctx.dealId) {
    const { data: d } = await admin
      .from("deals")
      .select("title")
      .eq("id", ctx.dealId)
      .eq("org_id", orgId)
      .maybeSingle();
    deal = d ?? null;
  }

  const to = (contact?.email as string) ?? (ctx.data.email as string) ?? "";
  if (!to) return { type: "send_email", ok: false, msg: "contato sem e-mail de destino" };

  // Conexão Gmail ativa do org (o envio é feito pela conta conectada da org).
  const { data: conn } = await admin
    .from("email_connections")
    .select("id, org_id, user_id, email, access_token, refresh_token, token_expiry")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!conn) return { type: "send_email", ok: false, msg: "nenhuma conexão de e-mail ativa no org" };

  const token = await getValidAccessToken(admin, conn as GmailConnection);
  if (!token) return { type: "send_email", ok: false, msg: "token de e-mail inválido" };

  const tctx = { contact, deal, company };
  const subject = renderTemplate(String(tpl.subject ?? ""), tctx);
  const bodyHtml = renderTemplate(String(tpl.body_html ?? ""), tctx);

  const rawMsg = [
    `From: ${conn.email}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    bodyHtml,
  ].join("\r\n");
  const bytes = new TextEncoder().encode(rawMsg);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const rawB64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const sendResp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: rawB64 }),
    },
  );
  if (!sendResp.ok) {
    const err = await sendResp.text();
    return { type: "send_email", ok: false, msg: `Gmail recusou: ${err.slice(0, 160)}` };
  }
  const sent = await sendResp.json();

  await admin.from("emails").insert({
    org_id: orgId,
    user_id: conn.user_id,
    contact_id: ctx.contactId,
    deal_id: ctx.dealId,
    direction: "outbound",
    from_email: conn.email,
    to_emails: [to],
    subject,
    body_html: bodyHtml,
    thread_id: sent.threadId ?? null,
    sent_at: new Date().toISOString(),
    status: "sent",
  });

  return { type: "send_email", ok: true };
}

async function actCreateActivity(
  admin: Admin,
  orgId: string,
  params: Record<string, string>,
  ctx: { contactId: string | null; dealId: string | null },
): Promise<ActionResult> {
  const title = params.title;
  if (!title) return { type: "create_activity", ok: false, msg: "title ausente" };
  const { error } = await admin.from("activities").insert({
    org_id: orgId,
    title,
    type: "task", // enum activity_type: 'task' (atividade gerada pela automação).
    contact_id: ctx.contactId,
    deal_id: ctx.dealId,
  });
  if (error) return { type: "create_activity", ok: false, msg: error.message };
  return { type: "create_activity", ok: true };
}

async function actMoveDeal(
  admin: Admin,
  orgId: string,
  params: Record<string, string>,
  ctx: { dealId: string | null; automationName: string },
): Promise<ActionResult> {
  const stageId = params.stage_id;
  if (!stageId) return { type: "move_deal", ok: false, msg: "stage_id ausente" };
  if (!ctx.dealId) return { type: "move_deal", ok: false, msg: "evento sem deal para mover" };
  // A etapa precisa ser do org: a RPC confere org da etapa x org do negócio,
  // mas checar aqui devolve uma mensagem que diz o que aconteceu.
  const { data: stage } = await admin
    .from("pipeline_stages").select("id").eq("id", stageId).eq("org_id", orgId).maybeSingle();
  if (!stage) return { type: "move_deal", ok: false, msg: "etapa não encontrada no org" };
  // Passa pela RPC para o histórico registrar "por automação" com o nome dela.
  const moveu = await moverNegocio(admin, ctx.dealId, stageId, "automacao", `Automação "${ctx.automationName}"`);
  if (!moveu) return { type: "move_deal", ok: false, msg: "negócio não está aberto ou não pertence ao org" };
  return { type: "move_deal", ok: true };
}

/**
 * Abordagem ativa: a IA escreve e manda a primeira mensagem de WhatsApp para o
 * contato do evento. O trabalho fica na function ai-outreach (canal, template,
 * horário, conversa, histórico); aqui só se chama com o segredo interno.
 */
async function actAiOutreach(
  orgId: string,
  params: Record<string, string>,
  ctx: { contactId: string | null; dealId: string | null; automationName: string },
): Promise<ActionResult> {
  if (!ctx.contactId) return { type: "ai_outreach", ok: false, msg: "evento sem contato para abordar" };
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resp = await fetch(`${url}/functions/v1/ai-outreach`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    body: JSON.stringify({
      org_id: orgId,
      contact_id: ctx.contactId,
      deal_id: ctx.dealId,
      instruction: params.instruction ?? "",
      origem: `Automação "${ctx.automationName}"`,
    }),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) return { type: "ai_outreach", ok: false, msg: corpo?.error ?? `ai-outreach respondeu ${resp.status}` };
  if (corpo?.skipped) return { type: "ai_outreach", ok: true, msg: String(corpo.skipped) };
  return { type: "ai_outreach", ok: true, msg: corpo?.scheduled_at ? `agendada para ${corpo.scheduled_at}` : undefined };
}

async function actAddTag(
  admin: Admin,
  orgId: string,
  params: Record<string, string>,
  ctx: { contactId: string | null; dealId: string | null; triggerType: string },
): Promise<ActionResult> {
  const tagId = params.tag_id;
  if (!tagId) return { type: "add_tag", ok: false, msg: "tag_id ausente" };

  // A tag pertence ao org.
  const { data: tag } = await admin
    .from("tags")
    .select("id")
    .eq("id", tagId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!tag) return { type: "add_tag", ok: false, msg: "tag não encontrada no org" };

  // Evento de deal → deal_tags; caso contrário → contact_tags.
  if (ctx.triggerType === "deal_stage_changed" && ctx.dealId) {
    const { data: existing } = await admin
      .from("deal_tags")
      .select("tag_id")
      .eq("deal_id", ctx.dealId)
      .eq("tag_id", tagId)
      .maybeSingle();
    if (existing) return { type: "add_tag", ok: true };
    const { error } = await admin.from("deal_tags").insert({ deal_id: ctx.dealId, tag_id: tagId });
    if (error) return { type: "add_tag", ok: false, msg: error.message };
    return { type: "add_tag", ok: true };
  }

  if (!ctx.contactId) return { type: "add_tag", ok: false, msg: "evento sem contato para taguear" };
  const { data: existing } = await admin
    .from("contact_tags")
    .select("tag_id")
    .eq("contact_id", ctx.contactId)
    .eq("tag_id", tagId)
    .maybeSingle();
  if (existing) return { type: "add_tag", ok: true };
  const { error } = await admin
    .from("contact_tags")
    .insert({ contact_id: ctx.contactId, tag_id: tagId });
  if (error) return { type: "add_tag", ok: false, msg: error.message };
  return { type: "add_tag", ok: true };
}

async function actNotifyAgent(
  admin: Admin,
  orgId: string,
  params: Record<string, string>,
  ctx: { contactId: string | null; dealId: string | null },
): Promise<ActionResult> {
  const message = params.message;
  if (!message) return { type: "notify_agent", ok: false, msg: "message ausente" };

  // Destinatário: dono do deal → dono do contato. Sem dono → admins do org.
  let ownerId: string | null = null;
  let entityType = "contact";
  let entityId: string | null = ctx.contactId;

  if (ctx.dealId) {
    const { data: d } = await admin
      .from("deals")
      .select("owner_id")
      .eq("id", ctx.dealId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (d?.owner_id) {
      ownerId = d.owner_id;
      entityType = "deal";
      entityId = ctx.dealId;
    }
  }
  if (!ownerId && ctx.contactId) {
    const { data: c } = await admin
      .from("contacts")
      .select("owner_id")
      .eq("id", ctx.contactId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (c?.owner_id) ownerId = c.owner_id;
  }

  if (ownerId) {
    const { error } = await admin.rpc("create_notification", {
      p_org: orgId,
      p_user: ownerId,
      p_event_type: "automacao",
      p_title: message,
      p_body: null,
      p_entity_type: entityType,
      p_entity_id: entityId,
    });
    if (error) return { type: "notify_agent", ok: false, msg: error.message };
    return { type: "notify_agent", ok: true };
  }

  const { error } = await admin.rpc("notify_org_admins", {
    p_org: orgId,
    p_event_type: "automacao",
    p_title: message,
    p_body: null,
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) return { type: "notify_agent", ok: false, msg: error.message };
  return { type: "notify_agent", ok: true };
}

async function actStartSequence(
  admin: Admin,
  orgId: string,
  params: Record<string, string>,
  ctx: { contactId: string | null },
): Promise<ActionResult> {
  const sequenceId = params.sequence_id;
  if (!sequenceId) return { type: "start_sequence", ok: false, msg: "sequence_id ausente" };
  if (!ctx.contactId) return { type: "start_sequence", ok: false, msg: "evento sem contato" };

  // Sequência pertence ao org.
  const { data: seq } = await admin
    .from("email_sequences")
    .select("id")
    .eq("id", sequenceId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!seq) return { type: "start_sequence", ok: false, msg: "sequência não encontrada no org" };

  // Evita inscrição duplicada (mesma sequência + contato).
  const { data: existing } = await admin
    .from("email_sequence_enrollments")
    .select("id")
    .eq("sequence_id", sequenceId)
    .eq("contact_id", ctx.contactId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (existing) return { type: "start_sequence", ok: true };

  const { error } = await admin.from("email_sequence_enrollments").insert({
    org_id: orgId,
    sequence_id: sequenceId,
    contact_id: ctx.contactId,
    status: "active",
    current_step: 0,
  });
  if (error) return { type: "start_sequence", ok: false, msg: error.message };
  return { type: "start_sequence", ok: true };
}

async function runAction(
  admin: Admin,
  orgId: string,
  triggerType: string,
  action: Action,
  ctx: { contactId: string | null; dealId: string | null; data: Json; automationName: string },
): Promise<ActionResult> {
  const params = action.params ?? {};
  switch (action.type) {
    case "ai_outreach":
      return actAiOutreach(orgId, params, ctx);
    case "send_email":
      return actSendEmail(admin, orgId, params, ctx);
    case "create_activity":
      return actCreateActivity(admin, orgId, params, ctx);
    case "move_deal":
      return actMoveDeal(admin, orgId, params, ctx);
    case "add_tag":
      return actAddTag(admin, orgId, params, { ...ctx, triggerType });
    case "notify_agent":
      return actNotifyAgent(admin, orgId, params, ctx);
    case "start_sequence":
      return actStartSequence(admin, orgId, params, ctx);
    default:
      return { type: action.type, ok: false, msg: "tipo de ação desconhecido" };
  }
}

// ---------------------------------------------------------------------------
// Processa um único log já reivindicado (status='processing').
// ---------------------------------------------------------------------------
async function processLog(admin: Admin, log: Json): Promise<void> {
  const orgId = log.org_id as string;
  const automationId = log.automation_id as string;
  const triggerData = (log.trigger_data ?? {}) as Json;

  // Carrega a automação (escopo do org do log).
  const { data: automation } = await admin
    .from("automations")
    .select("id, name, is_active, trigger, conditions, actions, run_count, error_count")
    .eq("id", automationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!automation) {
    await admin
      .from("automation_logs")
      .update({ status: "error", error_msg: "automação não encontrada", ran_at: new Date().toISOString() })
      .eq("id", log.id);
    return;
  }
  if (!automation.is_active) {
    await admin
      .from("automation_logs")
      .update({
        status: "ok",
        result: { skipped: "inactive" },
        ran_at: new Date().toISOString(),
      })
      .eq("id", log.id);
    return;
  }

  const triggerType = (automation.trigger as Json)?.type as string;

  // Condições (AND). Se não passar, não é erro: log 'ok' com skipped.
  if (!conditionsPass(automation.conditions, triggerData)) {
    await admin
      .from("automation_logs")
      .update({
        status: "ok",
        result: { skipped: "conditions" },
        ran_at: new Date().toISOString(),
      })
      .eq("id", log.id);
    await admin
      .from("automations")
      .update({ run_count: (automation.run_count ?? 0) + 1, last_run_at: new Date().toISOString() })
      .eq("id", automationId);
    return;
  }

  const { contactId, dealId } = await resolveEntities(admin, orgId, triggerType, triggerData);
  const ctx = { contactId, dealId, data: triggerData, automationName: String(automation.name ?? "") };

  const actions: Action[] = Array.isArray(automation.actions)
    ? (automation.actions as Action[])
    : [];
  const results: ActionResult[] = [];
  for (const action of actions) {
    if (!action || typeof action !== "object" || typeof action.type !== "string") {
      results.push({ type: "invalid", ok: false, msg: "ação malformada" });
      continue;
    }
    try {
      results.push(await runAction(admin, orgId, triggerType, action, ctx));
    } catch (err) {
      results.push({
        type: action.type,
        ok: false,
        msg: err instanceof Error ? err.message : "erro inesperado",
      });
    }
  }

  // Critério: log 'error' se QUALQUER ação falhou; senão 'ok'. As demais ações
  // sempre rodam (uma falha não interrompe as outras) — o result registra cada uma.
  const anyFailed = results.some((r) => !r.ok);
  const errorMsg = anyFailed
    ? results.filter((r) => !r.ok).map((r) => `${r.type}: ${r.msg}`).join("; ")
    : null;

  await admin
    .from("automation_logs")
    .update({
      status: anyFailed ? "error" : "ok",
      result: { actions: results },
      error_msg: errorMsg,
      ran_at: new Date().toISOString(),
    })
    .eq("id", log.id);

  await admin
    .from("automations")
    .update({
      run_count: (automation.run_count ?? 0) + 1,
      error_count: (automation.error_count ?? 0) + (anyFailed ? 1 : 0),
      last_run_at: new Date().toISOString(),
    })
    .eq("id", automationId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (!(await cronAutorizado(req, admin))) return naoAutorizado();

    // Pega candidatos 'queued' mais antigos primeiro.
    const { data: candidates, error: selErr } = await admin
      .from("automation_logs")
      .select("id")
      .eq("status", "queued")
      .order("ran_at", { ascending: true })
      .limit(BATCH_LIMIT);
    if (selErr) return json({ error: selErr.message }, 500);

    let processed = 0;
    for (const cand of candidates ?? []) {
      // Reivindica de forma atômica: só quem conseguir virar 'queued'→'processing'
      // processa (evita corrida entre execuções concorrentes do cron).
      const { data: claimed } = await admin
        .from("automation_logs")
        .update({ status: "processing" })
        .eq("id", cand.id)
        .eq("status", "queued")
        .select("id, org_id, automation_id, trigger_data")
        .maybeSingle();
      if (!claimed) continue; // já reivindicado por outra execução.

      try {
        await processLog(admin, claimed as Json);
      } catch (err) {
        await admin
          .from("automation_logs")
          .update({
            status: "error",
            error_msg: err instanceof Error ? err.message : "erro inesperado",
            ran_at: new Date().toISOString(),
          })
          .eq("id", cand.id);
      }
      processed++;
    }

    return json({ ok: true, processed });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
