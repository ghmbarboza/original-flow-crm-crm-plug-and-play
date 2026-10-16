// Envio de WhatsApp pelo canal da ORGANIZAÇÃO para um número qualquer (usuário
// ou contato), fora de uma conversa: Evolution manda texto livre; Meta e Zernio
// exigem um template aprovado (o texto vai como parâmetro do template).
// Usado por notification-dispatcher (avisos ao time) e appointment-dispatcher
// (lembrete e no-show ao contato).
//
// A conta que envia é a marcada como padrão de notificações em channel_accounts
// (ver _shared/canal.ts); sem marcação, a primeira que pode iniciar conversa.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { GRAPH_VERSION, ZERNIO_API, contaDeNotificacoes, zernioAccountIdDaConta } from "./canal.ts";

export async function enviarWhatsappOrg(admin: SupabaseClient, orgId: string, numero: string, texto: string, templateNome: string | null): Promise<{ ok: boolean; motivo?: string }> {
  const conta = await contaDeNotificacoes(admin, orgId);
  if (!conta) return { ok: false, motivo: "nenhum canal de WhatsApp conectado" };

  if (conta.provider === "evolution" && conta.evolution) {
    const resp = await fetch(`${conta.evolution.server_url}/message/sendText/${conta.evolution.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: conta.evolution.api_key },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    return resp.ok ? { ok: true } : { ok: false, motivo: `Evolution respondeu ${resp.status}` };
  }

  if (!templateNome) return { ok: false, motivo: "Meta e Zernio exigem um template aprovado no modelo da notificação" };

  if (conta.provider === "meta_official" && conta.meta) {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${conta.meta.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${conta.meta.access_token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: numero, type: "template",
        template: { name: templateNome, language: { code: "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: texto.slice(0, 1000) }] }] },
      }),
    });
    if (resp.ok) return { ok: true };
    const err = await resp.json().catch(() => ({}));
    return { ok: false, motivo: err?.error?.message ?? `Meta respondeu ${resp.status}` };
  }

  if (conta.provider === "zernio" && conta.zernio) {
    const accountId = await zernioAccountIdDaConta(conta, "whatsapp");
    if (!accountId) return { ok: false, motivo: "nenhuma conta de WhatsApp conectada no Zernio" };
    const resp = await fetch(`${ZERNIO_API}/inbox/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${conta.zernio.api_key}` },
      body: JSON.stringify({ accountId, participantId: numero, templateName: templateNome, templateLanguage: "pt_BR", templateParams: [texto.slice(0, 1000)] }),
    });
    return resp.ok ? { ok: true } : { ok: false, motivo: `Zernio respondeu ${resp.status}` };
  }
  return { ok: false, motivo: `conta de notificações sem credenciais (${conta.provider})` };
}
