// Envia uma mensagem por um canal do Zernio e registra em conversation_messages.
//
// O cliente manda conversation_id + content. A função resolve a zernio_config da
// org, o id da conversa no Zernio (provider_conversation_id) e a conta conectada
// do canal (accountId), entrega ao Zernio e grava a mensagem outbound.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { registrarEnvioSimulado } from "../_shared/demo.ts";

const ZERNIO_API = "https://zernio.com/api/v1";

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
      .from("conversations")
      .select("id, org_id, channel, provider, provider_conversation_id, is_demo")
      .eq("id", conversation_id)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa não encontrada" }, 404);
    if (conversation.provider !== "zernio") {
      return json({ error: "Esta conversa não é do provedor Zernio." }, 400);
    }

    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (profile?.org_id !== conversation.org_id) {
      return json({ error: "Sem acesso a esta conversa" }, 403);
    }

    // Conversa de demonstração: nada vai para o Zernio.
    if (conversation.is_demo) {
      const id = await registrarEnvioSimulado(admin, {
        conversationId: conversation_id,
        orgId: conversation.org_id as string,
        content,
        sentBy: user.id,
      });
      return json({ ok: true, simulated: true, provider_message_id: id });
    }

    const zernioConversationId = conversation.provider_conversation_id as string | null;
    if (!zernioConversationId) {
      return json({ error: "Conversa sem id do Zernio (nenhuma mensagem recebida ainda)." }, 400);
    }

    const { data: config } = await admin
      .from("zernio_configs")
      .select("api_key, profile_id")
      .eq("org_id", conversation.org_id)
      .maybeSingle();
    if (!config) return json({ error: "Zernio não configurado para esta organização." }, 400);

    // Resolve a conta conectada do canal da conversa (accountId é obrigatório no envio).
    const accountsUrl = new URL(`${ZERNIO_API}/accounts`);
    accountsUrl.searchParams.set("profileId", config.profile_id as string);
    accountsUrl.searchParams.set("platform", conversation.channel as string);
    accountsUrl.searchParams.set("status", "connected");
    const accResp = await fetch(accountsUrl.toString(), {
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
    if (!accResp.ok) {
      const text = await accResp.text();
      return json({ error: `Zernio recusou a listagem de contas: ${text.slice(0, 160)}` }, 400);
    }
    const accData = await accResp.json().catch(() => ({}));
    const account = (accData.accounts ?? []).find((a: { isActive?: boolean }) => a.isActive) ?? (accData.accounts ?? [])[0];
    const accountId = account?._id as string | undefined;
    if (!accountId) {
      return json({ error: `Nenhuma conta conectada no Zernio para o canal ${conversation.channel}.` }, 400);
    }

    // Entrega ao Zernio.
    const sendResp = await fetch(`${ZERNIO_API}/inbox/conversations/${zernioConversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ accountId, message: content }),
    });

    if (!sendResp.ok) {
      const text = await sendResp.text();
      await admin.from("conversation_messages").insert({
        conversation_id, org_id: conversation.org_id, direction: "outbound",
        content, sent_by: user.id, type: "text", status: "failed",
      });
      return json({ error: `Zernio recusou o envio: ${text.slice(0, 200)}` }, 400);
    }

    const result = await sendResp.json().catch(() => ({}));
    const providerMessageId = result?.data?.messageId ?? null;

    const { error: msgError } = await admin.from("conversation_messages").insert({
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
      .from("conversations")
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
