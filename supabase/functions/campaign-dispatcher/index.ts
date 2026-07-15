// Dispara uma campanha de WhatsApp pela API Oficial (Meta).
//
// Carrega os destinatários pendentes, personaliza a mensagem por contato e envia
// via Graph API, atualizando o status de cada destinatário e o contador da campanha.
// Só funciona com provedor Meta (campanhas em massa não são permitidas na Evolution).
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

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => vars[key] ?? "");
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
    if (!userData?.user) return json({ error: "Não autorizado" }, 401);

    const { campaign_id } = await req.json().catch(() => ({}));
    if (!campaign_id) return json({ error: "Informe campaign_id." }, 400);

    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, org_id, message_template, status")
      .eq("id", campaign_id)
      .maybeSingle();
    if (!campaign) return json({ error: "Campanha não encontrada" }, 404);
    if (campaign.status === "sending" || campaign.status === "completed") {
      return json({ error: "Campanha já está em envio ou concluída." }, 409);
    }

    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("id", userData.user.id).maybeSingle();
    if (profile?.org_id !== campaign.org_id) return json({ error: "Sem acesso a esta campanha" }, 403);

    const { data: instance } = await admin
      .from("meta_instances")
      .select("phone_number_id, access_token")
      .eq("org_id", campaign.org_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!instance) return json({ error: "Nenhuma instância Meta ativa" }, 400);

    await admin
      .from("campaigns")
      .update({ status: "sending", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaign_id);

    const { data: recipients } = await admin
      .from("campaign_recipients")
      .select("id, phone_number, contact:contacts(first_name, company:companies(name))")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients ?? []) {
      const contact = recipient.contact as { first_name?: string; company?: { name?: string } } | null;
      const text = render(campaign.message_template, {
        nome: contact?.first_name ?? "",
        empresa: contact?.company?.name ?? "",
      });

      const resp = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${instance.phone_number_id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${instance.access_token}` },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipient.phone_number,
            type: "text",
            text: { body: text },
          }),
        },
      );

      if (resp.ok) {
        await admin
          .from("campaign_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", recipient.id);
        sent++;
      } else {
        const err = await resp.json().catch(() => ({}));
        await admin
          .from("campaign_recipients")
          .update({ status: "failed", error_msg: err?.error?.message ?? "Falha no envio" })
          .eq("id", recipient.id);
        failed++;
      }
    }

    await admin
      .from("campaigns")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        sent_count: sent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign_id);

    return json({ ok: true, sent, failed });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
