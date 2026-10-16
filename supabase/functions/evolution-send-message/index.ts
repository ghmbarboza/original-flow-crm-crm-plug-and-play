// Envia uma mensagem de texto pela Evolution API e registra em conversation_messages.
//
// O cliente manda apenas conversation_id + content. A função resolve a instância
// Evolution da org, entrega ao servidor e grava a mensagem outbound. A conversa
// tem seu preview/última mensagem atualizados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { registrarEnvioSimulado } from "../_shared/demo.ts";
import { contaDaConversa } from "../_shared/canal.ts";

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
      .select("id, org_id, phone_number, provider, channel, channel_account_id, is_demo")
      .eq("id", conversation_id)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa não encontrada" }, 404);

    // Confere que o usuário pertence à org da conversa.
    const { data: profile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.org_id !== conversation.org_id) return json({ error: "Sem acesso a esta conversa" }, 403);

    // Conversa de demonstração: registra como enviada e para aqui. O número é
    // fictício — mandar de verdade poderia acertar um desconhecido.
    if (conversation.is_demo) {
      const id = await registrarEnvioSimulado(admin, {
        conversationId: conversation_id,
        orgId: conversation.org_id as string,
        content,
        sentBy: user.id,
      });
      return json({ ok: true, simulated: true, provider_message_id: id });
    }

    // A resposta sai pela instância (número) em que a conversa entrou.
    const conta = await contaDaConversa(admin, { ...conversation, provider: "evolution" });
    const instance = conta?.evolution;
    if (!instance) return json({ error: "Nenhuma instância Evolution ativa" }, 400);

    // Entrega ao servidor Evolution.
    const sendResp = await fetch(`${instance.server_url}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key },
      body: JSON.stringify({ number: conversation.phone_number, text: content }),
    });

    let providerMessageId: string | null = null;
    let status = "sent";
    if (sendResp.ok) {
      const result = await sendResp.json().catch(() => ({}));
      providerMessageId = result?.key?.id ?? null;
    } else {
      const text = await sendResp.text();
      status = "failed";
      // Ainda registramos como falha para o agente ver que não saiu.
      await admin.from("conversation_messages").insert({
        conversation_id, org_id: conversation.org_id, direction: "outbound",
        content, sent_by: user.id, type: "text", status: "failed",
      });
      return json({ error: `Evolution recusou o envio: ${text.slice(0, 200)}` }, 400);
    }

    const { error: msgError } = await admin.from("conversation_messages").insert({
      conversation_id,
      org_id: conversation.org_id,
      direction: "outbound",
      content,
      sent_by: user.id,
      provider_message_id: providerMessageId,
      type: "text",
      status,
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
