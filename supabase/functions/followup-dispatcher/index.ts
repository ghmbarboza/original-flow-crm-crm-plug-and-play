// Dispatcher de follow-up automático (executar por cron, ex.: a cada 15 min).
//
// Para cada org com follow-up ativo, encontra conversas paradas (última mensagem
// enviada por nós, sem resposta) e avança a régua: quando o delay da próxima
// etapa venceu, envia a mensagem e registra a tentativa em followup_executions.
// Ao esgotar as tentativas, aplica o comportamento configurado (on_limit_reached).
//
// Segurança: sem auth de usuário — proteja por header secreto (FOLLOWUP_CRON_SECRET)
// ao agendar. Usa a service role para ler/escrever entre orgs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Preenche as variáveis do template com os dados do contato. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => vars[key] ?? "");
}

/** Anexo resolvido de uma etapa: URL alcançável pelo provedor + metadados. */
interface StepMedia {
  url: string;
  type: "image" | "document" | "video";
  filename: string | null;
}

async function sendText(
  admin: ReturnType<typeof createClient>,
  provider: string,
  orgId: string,
  phone: string,
  text: string,
  media?: StepMedia | null,
): Promise<string | null> {
  if (provider === "evolution") {
    const { data: instance } = await admin
      .from("evolution_configs")
      .select("server_url, api_key, instance_name")
      .eq("org_id", orgId).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!instance) return null;

    // Com mídia, o endpoint muda: sendMedia leva a URL + caption num só envio.
    const url = media
      ? `${instance.server_url}/message/sendMedia/${instance.instance_name}`
      : `${instance.server_url}/message/sendText/${instance.instance_name}`;
    const body = media
      ? {
          number: phone,
          mediatype: media.type,
          media: media.url,
          caption: text,
          fileName: media.filename ?? undefined,
        }
      : { number: phone, text };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key as string },
      body: JSON.stringify(body),
    });
    return resp.ok ? "sent" : null;
  }
  const { data: instance } = await admin
    .from("meta_configs")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!instance) return null;

  // Meta Cloud API: o tipo da mensagem é o tipo da mídia, com o texto de caption.
  const payload = media
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: media.type,
        [media.type]: {
          link: media.url,
          caption: text || undefined,
          ...(media.type === "document" && media.filename ? { filename: media.filename } : {}),
        },
      }
    : { messaging_product: "whatsapp", to: phone, type: "text", text: { body: text } };
  const resp = await fetch(`https://graph.facebook.com/v21.0/${instance.phone_number_id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${instance.access_token}` },
    body: JSON.stringify(payload),
  });
  return resp.ok ? "sent" : null;
}

/**
 * Resolve o anexo da etapa para uma URL que o provedor consiga baixar.
 * media_url externa vai direto; media_path (bucket privado whatsapp-media)
 * vira signed URL de 1h — o provedor baixa na hora do envio.
 */
async function resolveStepMedia(
  admin: ReturnType<typeof createClient>,
  step: { media_type?: string | null; media_path?: string | null; media_url?: string | null; media_filename?: string | null },
): Promise<StepMedia | null> {
  if (!step.media_type) return null;
  const type = step.media_type as StepMedia["type"];
  if (step.media_url) return { url: step.media_url, type, filename: step.media_filename ?? null };
  if (step.media_path) {
    const { data, error } = await admin.storage
      .from("whatsapp-media")
      .createSignedUrl(step.media_path, 3600);
    if (error || !data?.signedUrl) return null;
    return { url: data.signedUrl, type, filename: step.media_filename ?? null };
  }
  return null;
}

Deno.serve(async (req) => {
  // Proteção opcional por segredo do cron.
  const secret = Deno.env.get("FOLLOWUP_CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "Não autorizado" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = new Date();
  let sent = 0;
  let closed = 0;

  const { data: configs } = await admin
    .from("followup_configs")
    .select("org_id, max_attempts, on_limit_reached")
    .eq("is_active", true);

  for (const config of configs ?? []) {
    const orgId = config.org_id;
    const { data: steps } = await admin
      .from("followup_steps")
      .select("delay_hours, message_template, order, media_type, media_path, media_url, media_filename")
      .eq("org_id", orgId)
      .order("order");
    if (!steps || steps.length === 0) continue;

    // Conversas candidatas: abertas, com a última mensagem enviada por nós.
    const { data: conversations } = await admin
      .from("conversations")
      .select("id, org_id, provider, phone_number, contact_id, assigned_to, last_message_at, status, company:companies(name), contact:contacts(first_name, last_name)")
      .eq("org_id", orgId)
      .neq("status", "closed")
      .limit(200);

    for (const conv of conversations ?? []) {
      // Última mensagem precisa ser outbound (esperando resposta do cliente).
      const { data: lastMsg } = await admin
        .from("conversation_messages")
        .select("direction, sent_at")
        .eq("conversation_id", conv.id)
        .eq("is_internal_note", false)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastMsg || lastMsg.direction !== "outbound") continue;

      // Estado atual do follow-up desta conversa.
      const { data: execution } = await admin
        .from("followup_executions")
        .select("id, attempts, step_order, status, next_attempt_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (execution?.status === "completed" || execution?.status === "cancelled") continue;

      const attempts = execution?.attempts ?? 0;
      const nextStepIndex = attempts; // etapa 0 na primeira tentativa
      if (nextStepIndex >= steps.length || attempts >= (config.max_attempts ?? steps.length)) {
        // Esgotou: aplica o comportamento de limite.
        if (config.on_limit_reached === "mark_inactive" || config.on_limit_reached === "both") {
          if (conv.contact_id) await admin.from("contacts").update({ status: "churned" }).eq("id", conv.contact_id);
        }
        if ((config.on_limit_reached === "notify_agent" || config.on_limit_reached === "both") && conv.assigned_to) {
          // Notifica o agente responsável (notifications exige type + user_id).
          await admin.from("notifications").insert({
            org_id: orgId,
            user_id: conv.assigned_to,
            type: "followup_exhausted",
            title: "Follow-up esgotado",
            body: `A conversa com ${conv.phone_number} não respondeu ao follow-up.`,
            entity_type: "whatsapp_conversation",
            entity_id: conv.id,
          });
        }
        if (execution) await admin.from("followup_executions").update({ status: "completed" }).eq("id", execution.id);
        closed++;
        continue;
      }

      const step = steps[nextStepIndex];
      const baseTime = new Date(lastMsg.sent_at ?? conv.last_message_at ?? now);
      const dueAt = new Date(baseTime.getTime() + step.delay_hours * 3600_000);
      if (dueAt > now) continue; // ainda não venceu

      const contact = conv.contact as { first_name?: string; last_name?: string } | null;
      const company = conv.company as { name?: string } | null;
      const text = render(step.message_template, {
        nome: contact?.first_name ?? "",
        empresa: company?.name ?? "",
        agente: "",
      });

      // Anexo da etapa (Parte 10): resolvido na hora do envio, com dados frescos.
      const media = await resolveStepMedia(admin, step);

      const status = await sendText(admin, conv.provider, orgId, conv.phone_number, text, media);
      if (status) {
        await admin.from("conversation_messages").insert({
          conversation_id: conv.id, org_id: orgId, direction: "outbound",
          content: text, type: media?.type ?? "text", media_url: media?.url ?? null, status: "sent",
        });
        await admin.from("conversations").update({
          last_message_at: now.toISOString(), last_message_preview: text.slice(0, 120),
        }).eq("id", conv.id);

        if (execution) {
          await admin.from("followup_executions").update({
            attempts: attempts + 1, step_order: step.order, status: "pending",
            updated_at: now.toISOString(),
          }).eq("id", execution.id);
        } else {
          await admin.from("followup_executions").insert({
            org_id: orgId, conversation_id: conv.id, attempts: 1, step_order: step.order, status: "pending",
          });
        }
        sent++;
      }
    }
  }

  return json({ ok: true, sent, closed });
});
