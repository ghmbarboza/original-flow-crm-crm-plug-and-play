// Envia um email pela conta Gmail conectada e registra em emails.
//
// Monta a mensagem RFC 822, envia via Gmail API (users.me.messages.send) e grava
// o email como outbound, vinculado ao contato/deal quando informado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidAccessToken, type GmailConnection } from "../_shared/google.ts";

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

/** Codifica a mensagem em base64url, como a Gmail API exige. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

    const { to, subject, body_html, contact_id, deal_id, thread_id } = await req.json().catch(() => ({}));
    if (!to || !subject) return json({ error: "Informe to e subject." }, 400);

    const { data: conn } = await admin
      .from("email_connections")
      .select("id, org_id, user_id, email, access_token, refresh_token, token_expiry")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!conn) return json({ error: "Nenhuma conexão de Gmail ativa" }, 400);

    const token = await getValidAccessToken(admin, conn as GmailConnection);
    if (!token) return json({ error: "Não foi possível obter um token válido" }, 400);

    const raw = [
      `From: ${conn.email}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      body_html ?? "",
    ].join("\r\n");

    const sendResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: toBase64Url(raw), ...(thread_id ? { threadId: thread_id } : {}) }),
      },
    );
    if (!sendResp.ok) {
      const err = await sendResp.text();
      return json({ error: `Gmail recusou o envio: ${err.slice(0, 200)}` }, 400);
    }
    const result = await sendResp.json();

    const { error } = await admin.from("emails").insert({
      org_id: conn.org_id,
      user_id: conn.user_id,
      contact_id: contact_id ?? null,
      deal_id: deal_id ?? null,
      direction: "outbound",
      from_email: conn.email,
      to_emails: [to],
      subject,
      body_html: body_html ?? "",
      thread_id: result.threadId ?? thread_id ?? null,
      sent_at: new Date().toISOString(),
      status: "sent",
    });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, thread_id: result.threadId ?? null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
