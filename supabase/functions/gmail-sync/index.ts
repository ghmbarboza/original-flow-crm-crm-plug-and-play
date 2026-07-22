// Sincroniza mensagens recentes do Gmail do usuário para a tabela emails.
//
// Lista as mensagens dos últimos 7 dias, extrai remetente/assunto/corpo, casa o
// contato pelo email da outra ponta e grava evitando duplicatas (thread_id + data).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decodeBase64Url, getValidAccessToken, type GmailConnection } from "../_shared/google.ts";

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

function header(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractHtml(payload: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }): string {
  if (payload.mimeType === "text/html" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of (payload.parts ?? []) as typeof payload[]) {
    const found = extractHtml(part);
    if (found) return found;
  }
  return "";
}

/** Extrai o email de "Nome <email@x.com>". */
function parseEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader
      ? await admin.auth.getUser(authHeader.replace("Bearer ", ""))
      : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { data: conn } = await admin
      .from("email_connections")
      .select("id, org_id, user_id, email, access_token, refresh_token, token_expiry")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!conn) return json({ error: "Nenhuma conexão de Gmail ativa" }, 400);

    const token = await getValidAccessToken(admin, conn as GmailConnection);
    if (!token) return json({ error: "Não foi possível obter um token válido" }, 400);

    const listResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=" + encodeURIComponent("newer_than:7d"),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!listResp.ok) return json({ error: `Gmail API: ${(await listResp.text()).slice(0, 200)}` }, 502);
    const list = await listResp.json();

    let synced = 0;
    for (const ref of list.messages ?? []) {
      const msgResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!msgResp.ok) continue;
      const msg = await msgResp.json();
      const headers = msg.payload?.headers ?? [];

      const fromRaw = header(headers, "From");
      const toRaw = header(headers, "To");
      const subject = header(headers, "Subject");
      const dateRaw = header(headers, "Date");
      const sentAt = dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString();
      const fromEmail = parseEmail(fromRaw);
      const direction = fromEmail === conn.email.toLowerCase() ? "outbound" : "inbound";
      const counterparty = direction === "outbound" ? parseEmail(toRaw) : fromEmail;

      // Dedup: mesma thread + mesmo horário já existe.
      const { data: existing } = await admin
        .from("emails")
        .select("id")
        .eq("org_id", conn.org_id)
        .eq("thread_id", msg.threadId)
        .eq("sent_at", sentAt)
        .maybeSingle();
      if (existing) continue;

      const { data: contact } = await admin
        .from("contacts")
        .select("id")
        .eq("org_id", conn.org_id)
        .eq("email", counterparty)
        .is("merged_into_id", null)
        .maybeSingle();

      await admin.from("emails").insert({
        org_id: conn.org_id,
        user_id: conn.user_id,
        contact_id: contact?.id ?? null,
        direction,
        from_email: fromEmail,
        to_emails: [counterparty],
        subject,
        body_html: extractHtml(msg.payload ?? {}),
        thread_id: msg.threadId,
        sent_at: sentAt,
        status: "received",
      });
      synced++;
    }

    return json({ ok: true, synced });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
