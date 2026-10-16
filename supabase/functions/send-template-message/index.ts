// Envia um template aprovado dentro de uma conversa do WhatsApp oficial.
//
// É o caminho do atendente quando a janela de 24h fechou: texto livre a Meta
// recusa, template aprovado chega. O cliente manda conversation_id, o nome e o
// idioma do template e os valores das variáveis. O corpo do template é lido de
// novo no provedor aqui (o que a tela mostrou pode estar desatualizado, e o
// texto gravado na conversa não pode depender do que o navegador enviou).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { registrarEnvioSimulado } from "../_shared/demo.ts";
import {
  acessoAosTemplates, enviarTemplate, listarTemplates, renderTemplate, validarParametros,
} from "../_shared/templateWhatsapp.ts";
import { contaDaConversa } from "../_shared/canal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tetos da entrada, conferidos antes de qualquer chamada ao provedor.
const MAX_NOME_TEMPLATE = 512;
const MAX_IDIOMA = 20;
const MAX_VARIAVEIS = 20;

// Template é mensagem paga: uma pessoa não dispara mais que isto na mesma
// conversa por minuto (conta toda mensagem que ela enviou ali).
const MAX_ENVIOS_POR_MINUTO = 10;
const JANELA_LIMITE_MS = 60_000;

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

    const payload = await req.json().catch(() => ({}));
    const conversationId = typeof payload.conversation_id === "string" ? payload.conversation_id : "";
    const templateName = typeof payload.template_name === "string" ? payload.template_name.trim() : "";
    const templateLanguage = typeof payload.template_language === "string" ? payload.template_language.trim() : "";
    const paramsValidos = Array.isArray(payload.params) && payload.params.every((p: unknown) => typeof p === "string");
    if (!conversationId || !templateName || !templateLanguage || !paramsValidos) {
      return json({ error: "Informe conversation_id, template_name, template_language e params." }, 400);
    }
    if (
      templateName.length > MAX_NOME_TEMPLATE || templateLanguage.length > MAX_IDIOMA
      || payload.params.length > MAX_VARIAVEIS
    ) {
      return json({ error: "Template ou variáveis fora do tamanho aceito." }, 400);
    }
    const params = (payload.params as string[]).map((p) => p.trim());

    const { data: conversation } = await admin
      .from("conversations")
      .select("id, org_id, phone_number, channel, provider, provider_conversation_id, channel_account_id, is_demo")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa não encontrada" }, 404);

    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (profile?.org_id !== conversation.org_id) return json({ error: "Sem acesso a esta conversa" }, 403);

    const provider = conversation.provider as string;
    if (conversation.channel !== "whatsapp" || (provider !== "meta_official" && provider !== "zernio")) {
      return json({ error: "Templates só existem no WhatsApp pela API Oficial (Meta) ou pelo Zernio." }, 400);
    }
    const orgId = conversation.org_id as string;

    const { count: enviosRecentes, error: limiteError } = await admin
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("sent_by", user.id)
      .eq("direction", "outbound")
      .gt("sent_at", new Date(Date.now() - JANELA_LIMITE_MS).toISOString());
    if (limiteError) throw limiteError;
    if ((enviosRecentes ?? 0) >= MAX_ENVIOS_POR_MINUTO) {
      return json({ error: "Muitos envios seguidos nesta conversa. Aguarde um minuto e tente de novo." }, 429);
    }

    // O template sai pelo número em que a conversa entrou.
    const conta = await contaDaConversa(admin, conversation);
    const acesso = await acessoAosTemplates(admin, orgId, provider, conta);
    if ("erro" in acesso) return json({ error: acesso.erro }, 400);
    const lista = await listarTemplates(acesso);
    if ("erro" in lista) return json({ error: lista.erro }, 400);

    const template = lista.templates.find((t) => t.name === templateName && t.language === templateLanguage);
    if (!template) return json({ error: "Template não encontrado na conta do WhatsApp." }, 404);
    const recusa = validarParametros(template, params);
    if (recusa) return json({ error: recusa }, 400);

    const content = renderTemplate(template.body_text, params);

    // Conversa de demonstração: registra como enviada e para aqui (o número é
    // fictício e o provedor entregaria para quem quer que ele pertença).
    if (conversation.is_demo) {
      const id = await registrarEnvioSimulado(admin, { conversationId, orgId, content, sentBy: user.id });
      return json({ ok: true, simulated: true, provider_message_id: id, content });
    }

    const envio = await enviarTemplate(
      acesso.canal, conversation.phone_number as string,
      { nome: template.name, idioma: template.language }, params,
    );

    // Falha também fica na conversa, igual ao envio de texto: sem isso a
    // tentativa do atendente sumiria sem deixar rastro.
    const { error: msgError } = await admin.from("conversation_messages").insert({
      conversation_id: conversationId,
      org_id: orgId,
      direction: "outbound",
      content,
      sent_by: user.id,
      provider_message_id: envio.providerMessageId,
      type: "text",
      status: envio.ok ? "sent" : "failed",
    });
    if (!envio.ok) return json({ error: `O WhatsApp recusou o template: ${envio.motivo}` }, 400);
    // O template já saiu (e foi cobrado): responder erro aqui faria a pessoa
    // reenviar e o cliente receber duas vezes. Fica no log para investigar.
    if (msgError) console.error("[send-template-message] enviado, mas não gravado na conversa:", msgError.message);

    const agora = new Date().toISOString();
    await admin
      .from("conversations")
      .update({
        last_message_at: agora,
        last_message_preview: content.slice(0, 120),
        updated_at: agora,
        // O Zernio devolve o id da conversa dele: conversa aberta por aqui
        // passa a aceitar resposta de texto quando o cliente escrever.
        ...(!conversation.provider_conversation_id && envio.providerConversationId
          ? { provider_conversation_id: envio.providerConversationId }
          : {}),
      })
      .eq("id", conversationId);

    return json({ ok: true, provider_message_id: envio.providerMessageId, content });
  } catch (err) {
    console.error("[send-template-message]", err);
    return json({ error: "Não foi possível enviar o template." }, 500);
  }
});
