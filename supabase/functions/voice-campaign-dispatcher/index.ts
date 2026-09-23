// Campanhas de ligação (Sprint 12 B13). Cron por minuto: para cada campanha
// em andamento, respeita o limite de ligações simultâneas, pega contatos na
// fila e liga pela IA (mesmo caminho do call_outbound). Sem número pronto ou
// sem credenciais, a campanha para com o erro registrado.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamadaInterna, cronAutorizado, naoAutorizado } from "../_shared/seguranca.ts";
import { type AgenteVoz, compilarPromptDeVoz, credenciaisVoz, e164, elevenFetch } from "../_shared/voz.ts";

const LOTE = 20;
const MAX_TENTATIVAS = 2;
const RETENTATIVA_MIN = 120;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function processarCampanha(admin: SupabaseClient, campanha: Record<string, unknown>): Promise<{ colocadas: number; erros: string[] }> {
  const orgId = campanha.org_id as string;
  const erros: string[] = [];
  const { data: agenteRow } = await admin.from("voice_agents").select("*").eq("org_id", orgId).maybeSingle();
  const agente = agenteRow as AgenteVoz | null;
  if (!agente?.elevenlabs_agent_id) {
    await admin.from("voice_campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campanha.id as string);
    return { colocadas: 0, erros: ["agente de voz não sincronizado"] };
  }
  let q = admin.from("phone_numbers").select("*").eq("org_id", orgId).eq("status", "active").eq("outbound_enabled", true).not("elevenlabs_phone_number_id", "is", null);
  if (campanha.phone_number_id) q = q.eq("id", campanha.phone_number_id as string);
  const { data: numero } = await q.order("created_at").limit(1).maybeSingle();
  if (!numero) {
    await admin.from("voice_campaigns").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", campanha.id as string);
    return { colocadas: 0, erros: ["nenhum número pronto"] };
  }
  const { count: emAndamento } = await admin.from("calls").select("id", { count: "exact", head: true }).eq("campaign_id", campanha.id as string).in("status", ["queued", "ringing", "in_progress"]);
  const vagas = Math.max(0, Number(campanha.max_concurrent ?? 2) - (emAndamento ?? 0));
  if (vagas === 0) return { colocadas: 0, erros };

  const { data: fila } = await admin.from("voice_campaign_contacts").select("id, contact_id, attempts").eq("campaign_id", campanha.id as string).eq("status", "queued")
    .lte("dispatch_after", new Date().toISOString()).order("dispatch_after").limit(Math.min(LOTE, vagas));
  if (!fila?.length) {
    const { count: pendentes } = await admin.from("voice_campaign_contacts").select("id", { count: "exact", head: true }).eq("campaign_id", campanha.id as string).in("status", ["queued", "placed"]);
    if ((pendentes ?? 0) === 0) await admin.from("voice_campaigns").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", campanha.id as string);
    return { colocadas: 0, erros };
  }
  const cred = await credenciaisVoz(admin, orgId);
  const { agentName, companyName } = await compilarPromptDeVoz(admin, orgId, agente.prompt_extra);
  let colocadas = 0;
  for (const item of fila) {
    const { data: reservado } = await admin.from("voice_campaign_contacts").update({ status: "placed", attempts: (item.attempts ?? 0) + 1 }).eq("id", item.id).eq("status", "queued").select("id").maybeSingle();
    if (!reservado) continue;
    const { data: contato } = await admin.from("contacts").select("id, first_name, last_name, whatsapp_phone, phone").eq("id", item.contact_id).maybeSingle();
    const destino = e164(contato?.whatsapp_phone) ?? e164(contato?.phone);
    if (!contato || !destino) {
      await admin.from("voice_campaign_contacts").update({ status: "failed", last_error: "contato sem telefone válido" }).eq("id", item.id);
      continue;
    }
    const { data: deal } = await admin.from("deals").select("id").eq("org_id", orgId).eq("contact_id", contato.id).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: call } = await admin.from("calls").insert({
      org_id: orgId, contact_id: contato.id, deal_id: deal?.id ?? null, phone_number_id: numero.id, campaign_id: campanha.id, direction: "outbound", status: "queued",
      from_number: numero.e164, to_number: destino, purpose: "campaign", metadata: { instruction: campanha.instruction ?? null },
    }).select("id").single();
    if (!call) continue;
    try {
      const r = await elevenFetch(cred, agente, "/v1/convai/twilio/outbound-call", {
        method: "POST",
        body: JSON.stringify({
          agent_id: agente.elevenlabs_agent_id, agent_phone_number_id: numero.elevenlabs_phone_number_id, to_number: destino,
          conversation_initiation_client_data: { dynamic_variables: {
            flowcrm_call_id: call.id, company_name: companyName, agent_name: agentName,
            lead_name: [contato.first_name, contato.last_name].filter(Boolean).join(" ") || "cliente",
            call_purpose: String(campanha.instruction ?? "").slice(0, 300) || String(campanha.name ?? "campanha"),
          } },
        }),
      });
      await admin.from("calls").update({ status: "ringing", started_at: new Date().toISOString(), provider_call_sid: (r.callSid as string | undefined) ?? null, elevenlabs_conversation_id: (r.conversation_id as string | undefined) ?? null }).eq("id", call.id);
      await admin.from("voice_campaign_contacts").update({ call_id: call.id }).eq("id", item.id);
      colocadas++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("calls").update({ status: "failed", ended_at: new Date().toISOString(), metadata: { error: msg } }).eq("id", call.id);
      const tentativas = (item.attempts ?? 0) + 1;
      await admin.from("voice_campaign_contacts").update({
        status: tentativas >= MAX_TENTATIVAS ? "failed" : "queued", last_error: msg, call_id: call.id,
        dispatch_after: new Date(Date.now() + RETENTATIVA_MIN * 60_000).toISOString(),
      }).eq("id", item.id);
      erros.push(`${contato.id}: ${msg}`);
    }
  }
  if (colocadas) await admin.rpc("incrementar_campanha_voz", { p_campaign: campanha.id, p_campo: "placed", p_quanto: colocadas });
  return { colocadas, erros };
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!chamadaInterna(req) && !(await cronAutorizado(req, admin))) return naoAutorizado();
  try {
    const { data: campanhas } = await admin.from("voice_campaigns").select("*").eq("status", "running").limit(50);
    let colocadas = 0;
    const erros: string[] = [];
    for (const c of campanhas ?? []) {
      const r = await processarCampanha(admin, c as Record<string, unknown>);
      colocadas += r.colocadas;
      erros.push(...r.erros);
    }
    return json({ ok: true, campanhas: campanhas?.length ?? 0, colocadas, erros });
  } catch (err) {
    console.error("[voice-campaign-dispatcher]", err);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
