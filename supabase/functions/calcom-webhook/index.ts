// Webhook de confirmação de agendamento do Cal.com (Parte 11 do Sprint 10A).
//
// O admin cola a URL desta function (com ?org=<org_id>) no Cal.com, evento
// "Booking created". Ao confirmar um agendamento:
//   1. Busca o contato pelo email do participante.
//   2. Cria activity (type='meeting') vinculada ao contato — e ao deal aberto
//      mais recente, se a org marcou "vincular ao negócio".
//   3. Notifica o agente responsável (dono do contato; sem dono, os admins).
//
// A org vem da query string porque a URL da function é uma só para todas as
// orgs. Sem config ativa do Cal.com para a org, o evento é ignorado — a URL
// vazar não permite escrever nada em quem não ligou a integração.
//
// Assinatura: se CALCOM_WEBHOOK_SECRET estiver configurado, o header
// x-cal-signature-256 (HMAC-SHA256 do corpo) é verificado; sem o secret, o
// webhook aceita os eventos como o Cal.com os envia.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface CalcomAttendee {
  email?: string;
  name?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });

  try {
    const orgId = new URL(req.url).searchParams.get("org");
    if (!orgId) return json({ error: "Parâmetro org ausente." }, 400);

    const raw = await req.text();

    const secret = Deno.env.get("CALCOM_WEBHOOK_SECRET");
    if (secret) {
      const signature = req.headers.get("x-cal-signature-256") ?? "";
      if (signature !== (await hmacSha256Hex(secret, raw))) {
        return json({ error: "Assinatura inválida." }, 401);
      }
    }

    const event = JSON.parse(raw || "{}");
    const trigger = String(event?.triggerEvent ?? "");
    if (trigger && trigger !== "BOOKING_CREATED") {
      return json({ skipped: `evento ${trigger} ignorado` });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration } = await admin
      .from("integration_configs")
      .select("config, is_active")
      .eq("org_id", orgId)
      .eq("provider", "calcom")
      .maybeSingle();
    if (!integration?.is_active) return json({ skipped: "integração Cal.com inativa para a org" });

    const config = (integration.config ?? {}) as {
      create_activity?: boolean;
      link_deal?: boolean;
      notify_agent?: boolean;
    };

    const payload = event?.payload ?? {};
    const attendee: CalcomAttendee = (payload.attendees ?? [])[0] ?? {};
    const startTime: string | null = payload.startTime ?? null;
    const title: string = payload.title || "Reunião agendada via Cal.com";

    // Contato pelo email do participante — a chave que o Cal.com garante.
    let contactId: string | null = null;
    let ownerId: string | null = null;
    if (attendee.email) {
      const { data: contact } = await admin
        .from("contacts")
        .select("id, owner_id")
        .eq("org_id", orgId)
        .eq("email", attendee.email)
        .is("merged_into_id", null)
        .limit(1)
        .maybeSingle();
      contactId = contact?.id ?? null;
      ownerId = contact?.owner_id ?? null;
    }

    // Deal aberto mais recente do contato, se a org quer o vínculo.
    let dealId: string | null = null;
    if (config.link_deal !== false && contactId) {
      const { data: deal } = await admin
        .from("deals")
        .select("id, owner_id")
        .eq("org_id", orgId)
        .eq("contact_id", contactId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      dealId = deal?.id ?? null;
      ownerId = ownerId ?? deal?.owner_id ?? null;
    }

    let activityId: string | null = null;
    if (config.create_activity !== false) {
      const detalhes = [
        attendee.name || attendee.email ? `Participante: ${attendee.name ?? ""} ${attendee.email ? `(${attendee.email})` : ""}`.trim() : null,
        startTime ? `Início: ${startTime}` : null,
        "Confirmado via Cal.com.",
      ]
        .filter(Boolean)
        .join("\n");

      const { data: activity, error } = await admin
        .from("activities")
        .insert({
          org_id: orgId,
          type: "meeting",
          title,
          body: detalhes,
          due_date: startTime,
          contact_id: contactId,
          deal_id: dealId,
          user_id: ownerId,
        })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 500);
      activityId = activity.id;
    }

    if (config.notify_agent !== false) {
      const titulo = "Reunião agendada via Cal.com";
      const corpo = `${attendee.name ?? attendee.email ?? "Um contato"} confirmou: ${title}${startTime ? ` — ${startTime}` : ""}`;
      if (ownerId) {
        await admin.rpc("create_notification", {
          p_org: orgId,
          p_user: ownerId,
          p_event_type: "agendamento_confirmado",
          p_title: titulo,
          p_body: corpo,
          p_entity_type: "activity",
          p_entity_id: activityId,
        });
      } else {
        await admin.rpc("notify_org_admins", {
          p_org: orgId,
          p_event_type: "agendamento_confirmado",
          p_title: titulo,
          p_body: corpo,
          p_entity_type: "activity",
          p_entity_id: activityId,
        });
      }
    }

    return json({ ok: true, contact_id: contactId, deal_id: dealId, activity_id: activityId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
