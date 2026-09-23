// Envio de WhatsApp pelo canal da ORGANIZAÇÃO para um número qualquer (usuário
// ou contato), fora de uma conversa: Evolution manda texto livre; Meta e Zernio
// exigem um template aprovado (o texto vai como parâmetro do template).
// Usado por notification-dispatcher (avisos ao time) e appointment-dispatcher
// (lembrete e no-show ao contato).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ZERNIO_API = "https://zernio.com/api/v1";
const GRAPH_VERSION = "v21.0";

export async function enviarWhatsappOrg(admin: SupabaseClient, orgId: string, numero: string, texto: string, templateNome: string | null): Promise<{ ok: boolean; motivo?: string }> {
  const { data: evo } = await admin
    .from("evolution_configs").select("server_url, api_key, instance_name")
    .eq("org_id", orgId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (evo) {
    const resp = await fetch(`${evo.server_url}/message/sendText/${evo.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evo.api_key as string },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    return resp.ok ? { ok: true } : { ok: false, motivo: `Evolution respondeu ${resp.status}` };
  }

  if (!templateNome) return { ok: false, motivo: "Meta e Zernio exigem um template aprovado no modelo da notificação" };

  const { data: meta } = await admin
    .from("meta_configs").select("phone_number_id, access_token")
    .eq("org_id", orgId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (meta) {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${meta.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${meta.access_token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: numero, type: "template",
        template: { name: templateNome, language: { code: "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: texto.slice(0, 1000) }] }] },
      }),
    });
    if (resp.ok) return { ok: true };
    const err = await resp.json().catch(() => ({}));
    return { ok: false, motivo: err?.error?.message ?? `Meta respondeu ${resp.status}` };
  }

  const { data: zernio } = await admin.from("zernio_configs").select("api_key, profile_id").eq("org_id", orgId).maybeSingle();
  if (zernio) {
    const url = new URL(`${ZERNIO_API}/accounts`);
    url.searchParams.set("profileId", zernio.profile_id as string);
    url.searchParams.set("platform", "whatsapp");
    url.searchParams.set("status", "connected");
    const accResp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${zernio.api_key}` } });
    const accounts = ((await accResp.json().catch(() => ({})))?.accounts ?? []) as { _id?: string; isActive?: boolean }[];
    const accountId = (accounts.find((a) => a.isActive) ?? accounts[0])?._id;
    if (!accountId) return { ok: false, motivo: "nenhuma conta de WhatsApp conectada no Zernio" };
    const resp = await fetch(`${ZERNIO_API}/inbox/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${zernio.api_key}` },
      body: JSON.stringify({ accountId, participantId: numero, templateName: templateNome, templateLanguage: "pt_BR", templateParams: [texto.slice(0, 1000)] }),
    });
    return resp.ok ? { ok: true } : { ok: false, motivo: `Zernio respondeu ${resp.status}` };
  }
  return { ok: false, motivo: "nenhum canal de WhatsApp conectado" };
}
