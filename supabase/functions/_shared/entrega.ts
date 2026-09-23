// Envio de texto pelo canal da conversa (Evolution, Meta ou Zernio), sem
// áudio. Usado pela API pública e por quem precisar mandar texto numa conversa
// já existente. A ai-reply mantém a própria entrega porque trata áudio.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ZERNIO_API = "https://zernio.com/api/v1";
const GRAPH_VERSION = "v21.0";

export interface ConversaParaEnvio {
  id: string;
  org_id: string;
  provider: string;
  phone_number: string;
  channel?: string | null;
  provider_conversation_id?: string | null;
  is_demo?: boolean | null;
}

export interface ResultadoEntrega {
  ok: boolean;
  providerMessageId: string | null;
  motivo?: string;
}

export async function entregarTexto(admin: SupabaseClient, conversa: ConversaParaEnvio, texto: string): Promise<ResultadoEntrega> {
  if (conversa.is_demo) return { ok: true, providerMessageId: `demo-${crypto.randomUUID()}` };

  if (conversa.provider === "evolution") {
    const { data: inst } = await admin
      .from("evolution_configs").select("server_url, api_key, instance_name")
      .eq("org_id", conversa.org_id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!inst) return { ok: false, providerMessageId: null, motivo: "nenhuma instância Evolution ativa" };
    const resp = await fetch(`${inst.server_url}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key as string },
      body: JSON.stringify({ number: conversa.phone_number, text: texto }),
    });
    if (!resp.ok) return { ok: false, providerMessageId: null, motivo: `Evolution respondeu ${resp.status}` };
    const r = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: r?.key?.id ?? null };
  }

  if (conversa.provider === "meta_official") {
    const { data: inst } = await admin
      .from("meta_configs").select("phone_number_id, access_token")
      .eq("org_id", conversa.org_id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!inst) return { ok: false, providerMessageId: null, motivo: "nenhuma instância Meta ativa" };
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${inst.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${inst.access_token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: conversa.phone_number, type: "text", text: { body: texto } }),
    });
    if (!resp.ok) return { ok: false, providerMessageId: null, motivo: `Meta respondeu ${resp.status}` };
    const r = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: r?.messages?.[0]?.id ?? null };
  }

  if (conversa.provider === "zernio") {
    if (!conversa.provider_conversation_id) return { ok: false, providerMessageId: null, motivo: "conversa do Zernio sem id do provedor" };
    const { data: cfg } = await admin.from("zernio_configs").select("api_key, profile_id").eq("org_id", conversa.org_id).maybeSingle();
    if (!cfg) return { ok: false, providerMessageId: null, motivo: "Zernio não configurado" };
    const accountsUrl = new URL(`${ZERNIO_API}/accounts`);
    accountsUrl.searchParams.set("profileId", cfg.profile_id as string);
    accountsUrl.searchParams.set("platform", (conversa.channel as string) ?? "whatsapp");
    accountsUrl.searchParams.set("status", "connected");
    const accResp = await fetch(accountsUrl.toString(), { headers: { Authorization: `Bearer ${cfg.api_key}` } });
    const accounts = ((await accResp.json().catch(() => ({})))?.accounts ?? []) as { _id?: string; isActive?: boolean }[];
    const accountId = (accounts.find((a) => a.isActive) ?? accounts[0])?._id;
    if (!accountId) return { ok: false, providerMessageId: null, motivo: "nenhuma conta conectada no Zernio" };
    const resp = await fetch(`${ZERNIO_API}/inbox/conversations/${conversa.provider_conversation_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_key}` },
      body: JSON.stringify({ accountId, message: texto }),
    });
    if (!resp.ok) return { ok: false, providerMessageId: null, motivo: `Zernio respondeu ${resp.status}` };
    const r = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: r?.message?._id ?? r?.messageId ?? null };
  }

  return { ok: false, providerMessageId: null, motivo: `provedor desconhecido: ${conversa.provider}` };
}
