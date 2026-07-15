// Envia uma mensagem de texto pela WhatsApp Cloud API (Meta) e registra em
// whatsapp_messages. Estrutura idêntica à evolution-send-message, trocando o
// transporte pela Graph API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH_VERSION = "v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const { conversation_id, content } = await req.json().catch(() => ({}));
    if (!conversation_id || !content) {
      return json({ error: "Informe conversation_id e content." }, 400);
    }

    const { data: conversation } = await admin
      .from("whatsapp_conversations")
      .select("id, org_id, phone_number")
      .eq("id", conversation_id)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa não encontrada" }, 404);

    const { data: profile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.org_id !== conversation.org_id) return json({ error: "Sem acesso a esta conversa" }, 403);

    const { data: instance } = await admin
      .from("meta_instances")
      .select("phone_number_id, access_token")
      .eq("org_id", conversation.org_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!instance) return json({ error: "Nenhuma instância Meta ativa" }, 400);

    const sendResp = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${instance.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${instance.access_token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: conversation.phone_number,
          type: "text",
          text: { body: content },
        }),
      },
    );

    let providerMessageId: string | null = null;
    if (sendResp.ok) {
      const result = await sendResp.json().catch(() => ({}));
      providerMessageId = result?.messages?.[0]?.id ?? null;
    } else {
      const err = await sendResp.json().catch(() => ({}));
      await admin.from("whatsapp_messages").insert({
        conversation_id, org_id: conversation.org_id, direction: "outbound",
        content, sent_by: user.id, type: "text", status: "failed",
      });
      return json({ error: err?.error?.message ?? "Meta recusou o envio." }, 400);
    }

    const { error: msgError } = await admin.from("whatsapp_messages").insert({
      conversation_id,
      org_id: conversation.org_id,
      direction: "outbound",
      content,
      sent_by: user.id,
      provider_message_id: providerMessageId,
      type: "text",
      status: "sent",
    });
    if (msgError) return json({ error: msgError.message }, 500);

    await admin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 120),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    return json({ ok: true, provider_message_id: providerMessageId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
