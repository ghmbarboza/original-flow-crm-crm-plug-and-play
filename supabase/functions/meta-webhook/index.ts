// Webhook público da WhatsApp Cloud API (Meta).
//
// GET  → verificação do webhook (hub.challenge) contra META_WEBHOOK_VERIFY_TOKEN.
// POST → mensagens recebidas: resolve a instância pelo phone_number_id, cria/atualiza
//        contato e conversa, grava a mensagem e dispara a IA se ela estiver ativa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: unknown = { received: true }) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

function triggerAI(conversationId: string) {
  const call = fetch(`${SUPABASE_URL}/functions/v1/ai-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ conversation_id: conversationId }),
  }).catch(() => {});
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(call);
  return call;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificação do webhook.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    if (mode === "subscribe" && token && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return ok();

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));

  // Estrutura: entry[].changes[].value.{ metadata.phone_number_id, contacts, messages }
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneNumberId: string = value.metadata?.phone_number_id ?? "";
      const messages = value.messages ?? [];
      if (!phoneNumberId || messages.length === 0) continue;

      const { data: instance } = await admin
        .from("meta_configs")
        .select("id, org_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!instance) continue;

      const orgId = instance.org_id;
      const profileName = value.contacts?.[0]?.profile?.name ?? null;

      for (const msg of messages) {
        const phone: string = msg.from ?? "";
        const content: string = msg.text?.body ?? msg.button?.text ?? msg.interactive?.list_reply?.title ?? "";
        if (!phone || !content) continue;

        // Contato.
        const { data: existingContact } = await admin
          .from("contacts")
          .select("id")
          .eq("org_id", orgId)
          .eq("whatsapp_phone", phone)
          .is("merged_into_id", null)
          .maybeSingle();

        let contactId = existingContact?.id ?? null;
        if (!contactId) {
          const { data: created } = await admin
            .from("contacts")
            .insert({
              org_id: orgId,
              first_name: profileName ?? phone,
              whatsapp_phone: phone,
              status: "lead",
              source: "whatsapp",
            })
            .select("id")
            .single();
          contactId = created?.id ?? null;
        }

        // Conversa.
        const { data: existingConversation } = await admin
          .from("conversations")
          .select("id, status, unread_count")
          .eq("org_id", orgId)
          .eq("phone_number", phone)
          .maybeSingle();

        let conversationId = existingConversation?.id ?? null;
        let status = existingConversation?.status ?? "ai_active";
        if (!conversationId) {
          // Distribuição por canal: pré-atribui um agente elegível (round-robin) ou null.
          const { data: assignedTo } = await admin.rpc("pick_agent_for_channel", {
            p_org: orgId,
            p_channel: "whatsapp",
          });
          const { data: created } = await admin
            .from("conversations")
            .insert({
              org_id: orgId,
              phone_number: phone,
              contact_id: contactId,
              provider: "meta_official",
              status: "ai_active",
              assigned_to: assignedTo ?? null,
              last_message_at: new Date().toISOString(),
              last_message_preview: content.slice(0, 120),
              unread_count: 1,
            })
            .select("id, status")
            .single();
          conversationId = created?.id ?? null;
          status = created?.status ?? "ai_active";
        } else {
          await admin
            .from("conversations")
            .update({
              contact_id: contactId,
              last_message_at: new Date().toISOString(),
              last_message_preview: content.slice(0, 120),
              unread_count: (existingConversation?.unread_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversationId);
        }

        if (!conversationId) continue;

        await admin.from("conversation_messages").insert({
          conversation_id: conversationId,
          org_id: orgId,
          direction: "inbound",
          content,
          provider_message_id: msg.id ?? null,
          type: "text",
          status: "received",
        });

        // Lead scoring por canal. Sem regra ativa a função não faz nada.
        if (contactId) {
          if (!existingConversation) {
            await admin.rpc("apply_lead_score", {
              p_org: orgId, p_contact: contactId,
              p_event: "conversation_started", p_channel: "whatsapp",
            });
          }
          await admin.rpc("apply_lead_score", {
            p_org: orgId, p_contact: contactId,
            p_event: "message_received", p_channel: "whatsapp",
          });
        }

        if (status === "ai_active") {
          const call = triggerAI(conversationId);
          const runtime = (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
          if (!runtime) await call;
        }
      }
    }
  }

  return ok();
});
