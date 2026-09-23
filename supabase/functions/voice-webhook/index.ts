// Webhooks do ElevenLabs para a voz (Sprint 12 B13). Pública; a org vem de
// ?org=<id> e cada tipo tem a própria prova:
//   tipo=inicio  → início da conversa: header x-el-webhook-secret. Devolve as
//                  variáveis dinâmicas (nome do lead, motivo) e, numa ligação
//                  recebida, cria a linha em `calls` e liga ao contato pelo número.
//   tipo=tool    → ferramentas do agente durante a ligação: header x-el-webhook-secret.
//                  Reaproveita a base de conhecimento e a agenda da IA de texto.
//   tipo=fim     → pós-ligação: header elevenlabs-signature (HMAC do segredo da org).
//                  Marca a ligação e chama voice-call-finalize (interna).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { iguais } from "../_shared/seguranca.ts";
import { assinaturaConfere, type AgenteVoz, compilarPromptDeVoz, e164 } from "../_shared/voz.ts";
import { buscarConhecimento, registrarDuvida } from "../_shared/conhecimento.ts";
import { executarFerramentaAgenda } from "../_shared/agenda.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function segredoConfere(req: Request, agente: AgenteVoz): boolean {
  const recebido = req.headers.get("x-el-webhook-secret") ?? "";
  return !!recebido && iguais(recebido, agente.webhook_secret);
}

async function ligacaoDaChamada(admin: SupabaseClient, orgId: string, req: Request, corpo: Record<string, unknown>) {
  const callId = req.headers.get("x-voice-call-id") || String(corpo.flowcrm_call_id ?? "");
  const convId = req.headers.get("x-conversation-id") || String(corpo.conversation_id ?? "");
  if (callId && /^[0-9a-f-]{36}$/.test(callId)) {
    const { data } = await admin.from("calls").select("id, contact_id, deal_id, elevenlabs_conversation_id").eq("id", callId).eq("org_id", orgId).maybeSingle();
    if (data) return data;
  }
  if (convId) {
    const { data } = await admin.from("calls").select("id, contact_id, deal_id, elevenlabs_conversation_id").eq("elevenlabs_conversation_id", convId).eq("org_id", orgId).maybeSingle();
    if (data) return data;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  const tipo = url.searchParams.get("tipo") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(orgId)) return json({ error: "org inválida" }, 400);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: agenteRow } = await admin.from("voice_agents").select("*").eq("org_id", orgId).maybeSingle();
  if (!agenteRow) return json({ error: "agente de voz não configurado" }, 404);
  const agente = agenteRow as AgenteVoz;
  const raw = await req.text();
  let corpo: Record<string, unknown> = {};
  try { corpo = raw ? JSON.parse(raw) : {}; } catch { corpo = {}; }

  try {
    if (tipo === "inicio") {
      if (!segredoConfere(req, agente)) return json({ error: "não autorizado" }, 401);
      const vars = (corpo.dynamic_variables ?? {}) as Record<string, unknown>;
      const { agentName, companyName } = await compilarPromptDeVoz(admin, orgId, agente.prompt_extra);
      let leadName = String(vars.lead_name ?? "").trim();
      let callId = String(vars.flowcrm_call_id ?? "").trim();
      // Ligação recebida: ainda não existe linha em calls; cria e tenta achar o contato pelo número.
      if (!callId) {
        const de = e164(String(corpo.caller_id ?? ""));
        const para = e164(String(corpo.called_number ?? ""));
        let contato: { id: string; first_name: string; last_name: string | null } | null = null;
        if (de) {
          const fim = de.replace(/\D/g, "").slice(-10);
          const { data } = await admin.from("contacts").select("id, first_name, last_name").eq("org_id", orgId).is("merged_into_id", null)
            .or(`whatsapp_phone.like.%${fim},phone.like.%${fim}`).limit(1).maybeSingle();
          contato = data;
        }
        const { data: numero } = para ? await admin.from("phone_numbers").select("id").eq("org_id", orgId).eq("e164", para).maybeSingle() : { data: null };
        const { data: call } = await admin.from("calls").insert({
          org_id: orgId, contact_id: contato?.id ?? null, phone_number_id: numero?.id ?? null, direction: "inbound", status: "in_progress", purpose: "inbound",
          from_number: de, to_number: para, provider_call_sid: (corpo.call_sid as string | undefined) ?? null, elevenlabs_conversation_id: (corpo.conversation_id as string | undefined) ?? null,
          started_at: new Date().toISOString(),
        }).select("id").single();
        callId = call?.id ?? "";
        if (contato && !leadName) leadName = [contato.first_name, contato.last_name].filter(Boolean).join(" ");
      }
      return json({
        type: "conversation_initiation_client_data",
        dynamic_variables: { ...vars, flowcrm_call_id: callId, company_name: companyName, agent_name: agentName, lead_name: leadName || "cliente", call_purpose: String(vars.call_purpose ?? "") || "atender e entender a necessidade" },
      });
    }

    if (tipo === "tool") {
      if (!segredoConfere(req, agente)) return json({ error: "não autorizado" }, 401);
      const tool = url.searchParams.get("tool") ?? "";
      const call = await ligacaoDaChamada(admin, orgId, req, corpo);
      const contactId = call?.contact_id ?? null;
      if (tool === "buscar_conhecimento") return new Response(await buscarConhecimento(admin, orgId, corpo), { headers: { "Content-Type": "application/json" } });
      if (tool === "registrar_duvida") return new Response(await registrarDuvida(admin, { orgId, conversationId: null, contactId }, corpo), { headers: { "Content-Type": "application/json" } });
      if (tool === "qualificar_lead") {
        if (call) {
          const atual = ((await admin.from("calls").select("metadata").eq("id", call.id).maybeSingle()).data?.metadata ?? {}) as Record<string, unknown>;
          await admin.from("calls").update({ metadata: { ...atual, qualificacao: { interesse: corpo.interesse ?? null, dor: corpo.dor ?? null, orcamento: corpo.orcamento ?? null, prazo: corpo.prazo ?? null, proximo_passo: corpo.proximo_passo ?? null, temperatura: corpo.temperatura ?? null } } }).eq("id", call.id);
        }
        return json({ ok: true, instrucao: "Registrado. Continue a ligação normalmente." });
      }
      if (["consultar_disponibilidade", "agendar_reuniao", "remarcar_reuniao", "cancelar_reuniao"].includes(tool)) {
        // Na voz a "evidência literal" é a frase que o agente ouviu; não há histórico de texto para conferir.
        const resultado = await executarFerramentaAgenda(admin, {
          orgId, conversationId: null, contactId, dealId: call?.deal_id ?? null, sourceMessageId: call?.id ?? null,
          mensagensDoLead: [String(corpo.evidencia ?? "")], nomeContato: String(corpo.lead_name ?? "cliente"),
        }, tool, corpo);
        return new Response(resultado, { headers: { "Content-Type": "application/json" } });
      }
      return json({ error: "ferramenta desconhecida" }, 400);
    }

    if (tipo === "fim") {
      if (!(await assinaturaConfere(req.headers.get("elevenlabs-signature"), raw, agente.webhook_secret))) return json({ error: "assinatura inválida" }, 401);
      const tipoEvento = String(corpo.type ?? "");
      const dados = (corpo.data ?? {}) as Record<string, unknown>;
      const convId = String(dados.conversation_id ?? corpo.conversation_id ?? "");
      if (!convId) return json({ ok: true, skipped: "sem conversation_id" });
      const { data: call } = await admin.from("calls").select("id").eq("elevenlabs_conversation_id", convId).eq("org_id", orgId).maybeSingle();
      if (!call) return json({ ok: true, skipped: "ligação desconhecida" });
      if (["post_call_transcription", "call_end", "conversation_ended"].includes(tipoEvento) || tipoEvento === "") {
        // O payload pode já trazer transcrição e resumo; a finalização confere e completa pelo provedor.
        const finalizar = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/voice-call-finalize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ call_id: call.id, payload: dados }),
        }).catch((e) => console.error("[voice-webhook] finalize:", e instanceof Error ? e.message : e));
        const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
        if (runtime?.waitUntil) runtime.waitUntil(finalizar); else await finalizar;
      }
      return json({ ok: true });
    }
    return json({ error: "tipo desconhecido" }, 400);
  } catch (e) {
    console.error("[voice-webhook]", e);
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
