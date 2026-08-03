// Trava de segurança do modo demonstração.
//
// Conversas semeadas por `demo-data` têm números e ids fictícios, mas as
// functions de envio não sabem disso: elas resolveriam a instância REAL do
// cliente e mandariam a mensagem para um número inventado — que pode existir e
// pertencer a um estranho. Por isso todo caminho de envio passa por aqui antes
// de falar com o provedor.
//
// O envio não é rejeitado: ele é SIMULADO. A mensagem é gravada como enviada,
// então a demo continua parecendo uma conversa de verdade no Inbox.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Marca no `conversation_messages` que a mensagem não saiu para fora. */
export const PREFIXO_SIMULADO = "demo-simulado";

/**
 * Grava a mensagem como enviada sem chamar o provedor.
 *
 * Devolve o id fictício de mensagem para quem chama repassar na resposta.
 */
export async function registrarEnvioSimulado(
  admin: SupabaseClient,
  params: {
    conversationId: string;
    orgId: string;
    content: string;
    sentBy?: string | null;
    isFromAi?: boolean;
  },
): Promise<string> {
  const providerMessageId = `${PREFIXO_SIMULADO}-${crypto.randomUUID()}`;
  const agora = new Date().toISOString();

  // Se nem o insert local funcionou, responder "ok" mentiria para a UI: a
  // mensagem apareceria como enviada e sumiria no próximo refetch.
  const { error: insertErr } = await admin.from("conversation_messages").insert({
    conversation_id: params.conversationId,
    org_id: params.orgId,
    direction: "outbound",
    content: params.content,
    sent_by: params.sentBy ?? null,
    is_from_ai: params.isFromAi ?? false,
    provider_message_id: providerMessageId,
    type: "text",
    status: "sent",
    is_demo: true,
  });
  if (insertErr) {
    throw new Error(`Falha ao gravar envio simulado da demo: ${insertErr.message}`);
  }

  const { error: updateErr } = await admin
    .from("conversations")
    .update({
      last_message_at: agora,
      last_message_preview: params.content.slice(0, 120),
      updated_at: agora,
    })
    .eq("id", params.conversationId);
  if (updateErr) {
    // Preview desatualizado não invalida o envio simulado — só registra.
    console.warn(`[demo] preview da conversa ${params.conversationId} não atualizado: ${updateErr.message}`);
  }

  console.log(`[demo] envio simulado na conversa ${params.conversationId} — nada saiu para o provedor.`);
  return providerMessageId;
}