// Dispatcher de mensagens programadas (executar por cron, ex.: a cada 5 min).
//
// Busca scheduled_messages pendentes e vencidas, resolve a conversa do contato
// (a gravada na linha ou, sem ela, a mais recente não-encerrada), renderiza as
// variáveis com dados frescos do contato e envia pelo provedor da conversa
// (evolution/meta/zernio). Marca sent/failed — falha fica dita em error_msg,
// nunca engolida.
//
// Segurança: sem auth de usuário — proteja por header secreto
// (SCHEDULED_CRON_SECRET) ao agendar, como o followup-dispatcher.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZERNIO_API = "https://zernio.com/api/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Variáveis {{chave}} (com ponto) resolvidas; sem valor vira vazio. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

type Admin = ReturnType<typeof createClient>;

interface Conversa {
  id: string;
  provider: string;
  channel: string;
  phone_number: string;
  provider_conversation_id: string | null;
}

/** Envia texto pelo provedor da conversa. Devolve null com o motivo em caso de falha. */
async function enviar(
  admin: Admin,
  orgId: string,
  conv: Conversa,
  text: string,
): Promise<{ ok: boolean; motivo?: string }> {
  if (conv.provider === "evolution") {
    const { data: instance } = await admin
      .from("evolution_configs")
      .select("server_url, api_key, instance_name")
      .eq("org_id", orgId).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!instance) return { ok: false, motivo: "Evolution não configurada" };
    const resp = await fetch(`${instance.server_url}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key as string },
      body: JSON.stringify({ number: conv.phone_number, text }),
    });
    return resp.ok ? { ok: true } : { ok: false, motivo: `Evolution respondeu ${resp.status}` };
  }

  if (conv.provider === "zernio") {
    if (!conv.provider_conversation_id) {
      return { ok: false, motivo: "Conversa sem id do Zernio (nenhuma mensagem recebida ainda)" };
    }
    const { data: config } = await admin
      .from("zernio_configs")
      .select("api_key, profile_id")
      .eq("org_id", orgId).maybeSingle();
    if (!config) return { ok: false, motivo: "Zernio não configurado" };

    const accountsUrl = new URL(`${ZERNIO_API}/accounts`);
    accountsUrl.searchParams.set("profileId", config.profile_id as string);
    accountsUrl.searchParams.set("platform", conv.channel);
    accountsUrl.searchParams.set("status", "connected");
    const accResp = await fetch(accountsUrl.toString(), {
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
    if (!accResp.ok) return { ok: false, motivo: `Zernio recusou a listagem de contas (${accResp.status})` };
    const accData = await accResp.json().catch(() => ({}));
    const account = (accData.accounts ?? []).find((a: { isActive?: boolean }) => a.isActive) ?? (accData.accounts ?? [])[0];
    if (!account?._id) return { ok: false, motivo: `Nenhuma conta Zernio conectada no canal ${conv.channel}` };

    const resp = await fetch(`${ZERNIO_API}/inbox/conversations/${conv.provider_conversation_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ accountId: account._id, message: text }),
    });
    return resp.ok ? { ok: true } : { ok: false, motivo: `Zernio respondeu ${resp.status}` };
  }

  // Meta (API oficial) é o caminho restante.
  const { data: instance } = await admin
    .from("meta_configs")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!instance) return { ok: false, motivo: "Meta não configurada" };
  const resp = await fetch(`https://graph.facebook.com/v21.0/${instance.phone_number_id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${instance.access_token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: conv.phone_number, type: "text", text: { body: text } }),
  });
  return resp.ok ? { ok: true } : { ok: false, motivo: `Meta respondeu ${resp.status}` };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("SCHEDULED_CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "Não autorizado" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = new Date().toISOString();
  let sent = 0;
  let failed = 0;

  // Lote limitado: com cron de 5 min, um backlog gigante não trava a execução.
  const { data: pendentes, error } = await admin
    .from("scheduled_messages")
    .select("id, org_id, contact_id, conversation_id, message")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(50);
  if (error) return json({ error: error.message }, 500);

  for (const msg of pendentes ?? []) {
    const falhar = async (motivo: string) => {
      await admin.from("scheduled_messages")
        .update({ status: "failed", error_msg: motivo })
        .eq("id", msg.id);
      failed++;
    };

    // Conversa: a gravada na linha, senão a mais recente não-encerrada do contato.
    let conv: Conversa | null = null;
    if (msg.conversation_id) {
      const { data } = await admin
        .from("conversations")
        .select("id, provider, channel, phone_number, provider_conversation_id, status, is_demo")
        .eq("id", msg.conversation_id).maybeSingle();
      // Trava da demo: conversa semeada nunca recebe envio agendado real.
      if (data && data.status !== "closed" && data.is_demo !== true) conv = data as unknown as Conversa;
    }
    if (!conv) {
      const { data } = await admin
        .from("conversations")
        .select("id, provider, channel, phone_number, provider_conversation_id")
        .eq("contact_id", msg.contact_id)
        .neq("status", "closed")
        .eq("is_demo", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();
      conv = (data as unknown as Conversa) ?? null;
    }
    if (!conv) {
      await falhar("Contato sem conversa ativa para receber a mensagem");
      continue;
    }

    const { data: contact } = await admin
      .from("contacts")
      .select("first_name, last_name")
      .eq("id", msg.contact_id).maybeSingle();
    const first = (contact?.first_name as string) ?? "";
    const last = (contact?.last_name as string) ?? "";
    const text = render(msg.message as string, {
      "contact.first_name": first,
      "contact.last_name": last,
      "contact.name": [first, last].filter(Boolean).join(" "),
    });

    const resultado = await enviar(admin, msg.org_id as string, conv, text);
    if (!resultado.ok) {
      await falhar(resultado.motivo ?? "Falha no envio");
      continue;
    }

    // Registra no histórico da conversa, como followup e zernio-send fazem —
    // o agente vê a mensagem programada no chat como qualquer outra.
    await admin.from("conversation_messages").insert({
      conversation_id: conv.id, org_id: msg.org_id, direction: "outbound",
      content: text, type: "text", status: "sent",
      // Sem esta referência a mensagem fica idêntica a uma digitada agora, e
      // ninguém que abre a conversa sabe que o envio foi programado.
      scheduled_message_id: msg.id,
    });
    await admin.from("conversations").update({
      last_message_at: now, last_message_preview: text.slice(0, 120),
    }).eq("id", conv.id);
    await admin.from("scheduled_messages")
      .update({ status: "sent", sent_at: now, error_msg: null })
      .eq("id", msg.id);
    sent++;
  }

  return json({ processed: (pendentes ?? []).length, sent, failed });
});
