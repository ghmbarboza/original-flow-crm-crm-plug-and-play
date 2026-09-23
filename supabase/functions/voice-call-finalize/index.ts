// Fim da ligação (Sprint 12 B13). Chamada interna pelo voice-webhook.
// Busca a conversa no ElevenLabs (transcrição, resumo, duração, áudio), grava
// em `calls` (o trigger cria a atividade 'call'), classifica a ligação com a IA,
// funde o que se soube na memória do lead (mesmas regras da análise pós-conversa)
// e preenche o BANT do negócio aberto onde estiver vazio.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamadaInterna, naoAutorizado } from "../_shared/seguranca.ts";
import { type AgenteVoz, baseEleven, classificarLigacao, credenciaisVoz } from "../_shared/voz.ts";
import { fundirAnalise, lerMemoria } from "../_shared/leadState.ts";

const BUCKET = "voice-recordings";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface Transcricao { role?: string; message?: string | null; time_in_call_secs?: number }

async function conversaDoProvedor(cred: { elevenKey: string }, agente: AgenteVoz, convId: string) {
  const base = baseEleven(agente);
  const resp = await fetch(`${base}/v1/convai/conversations/${convId}`, { headers: { "xi-api-key": cred.elevenKey } });
  if (!resp.ok) throw new Error(`ElevenLabs respondeu ${resp.status} ao buscar a conversa`);
  const c = await resp.json() as { transcript?: Transcricao[]; analysis?: { transcript_summary?: string }; metadata?: { call_duration_secs?: number }; status?: string };
  let audio: Uint8Array | null = null;
  try {
    const a = await fetch(`${base}/v1/convai/conversations/${convId}/audio`, { headers: { "xi-api-key": cred.elevenKey } });
    if (a.ok) audio = new Uint8Array(await a.arrayBuffer());
  } catch { audio = null; }
  return { transcript: c.transcript ?? [], resumo: c.analysis?.transcript_summary ?? null, duracao: c.metadata?.call_duration_secs ?? null, audio };
}

async function preencherBant(admin: SupabaseClient, orgId: string, dealId: string, c: { budget?: string; role?: string; primary_pain?: string; decision_timeline?: string }) {
  const { data: deal } = await admin.from("deals").select("qualification").eq("id", dealId).eq("org_id", orgId).maybeSingle();
  const q = { ...((deal?.qualification as Record<string, string | null>) ?? {}) };
  let mudou = false;
  for (const [k, v] of Object.entries({ budget: c.budget, authority: c.role, need: c.primary_pain, timeline: c.decision_timeline })) {
    if (v && !q[k]) { q[k] = `${v} (inferido pela IA na ligação)`; mudou = true; }
  }
  if (mudou) await admin.from("deals").update({ qualification: q }).eq("id", dealId).eq("org_id", orgId);
}

Deno.serve(async (req) => {
  if (!chamadaInterna(req)) return naoAutorizado();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const callId = String(body.call_id ?? "");
    const { data: call } = await admin.from("calls").select("*").eq("id", callId).maybeSingle();
    if (!call) return json({ error: "ligação não encontrada" }, 404);
    if (call.status === "completed" && call.summary) return json({ ok: true, skipped: "já finalizada" });
    const { data: agenteRow } = await admin.from("voice_agents").select("*").eq("org_id", call.org_id).maybeSingle();
    const agente = agenteRow as AgenteVoz | null;
    if (!agente) return json({ error: "agente de voz não configurado" }, 404);

    // Transcrição: do payload do webhook quando veio, senão do provedor.
    const payload = (body.payload ?? {}) as { transcript?: Transcricao[]; analysis?: { transcript_summary?: string }; metadata?: { call_duration_secs?: number } };
    let transcript: Transcricao[] = Array.isArray(payload.transcript) ? payload.transcript : [];
    let resumo: string | null = payload.analysis?.transcript_summary ?? null;
    let duracao: number | null = payload.metadata?.call_duration_secs ?? null;
    let audio: Uint8Array | null = null;
    if (call.elevenlabs_conversation_id) {
      try {
        const cred = await credenciaisVoz(admin, call.org_id);
        const c = await conversaDoProvedor(cred, agente, call.elevenlabs_conversation_id);
        if (c.transcript.length) transcript = c.transcript;
        resumo = c.resumo ?? resumo;
        duracao = c.duracao ?? duracao;
        audio = c.audio;
      } catch (e) {
        console.error("[voice-call-finalize] provedor:", e instanceof Error ? e.message : e);
      }
    }

    let recordingPath: string | null = call.recording_path;
    if (audio && audio.length > 0) {
      const path = `${call.org_id}/${new Date().toISOString().slice(0, 7)}/${call.id}.mp3`;
      const { error } = await admin.storage.from(BUCKET).upload(path, audio, { contentType: "audio/mpeg", upsert: true });
      if (!error) recordingPath = path;
    }

    const classificacao = await classificarLigacao(transcript, resumo);
    const falou = transcript.some((t) => t.role !== "agent" && t.message);
    const status = falou ? "completed" : (classificacao.category === "no_answer" ? "no_answer" : "completed");
    await admin.from("calls").update({
      status, ended_at: new Date().toISOString(), duration_seconds: duracao, recording_path: recordingPath,
      transcript: transcript.map((t) => ({ role: t.role ?? "user", message: t.message ?? "", time_in_call_secs: t.time_in_call_secs ?? null })),
      summary: classificacao.summary || resumo, classification: classificacao,
    }).eq("id", call.id);

    // Memória do lead e BANT, com as mesmas regras da análise pós-conversa.
    if (call.contact_id && falou) {
      const { data: contato } = await admin.from("contacts").select("client_memory").eq("id", call.contact_id).maybeSingle();
      const memoria = lerMemoria(contato?.client_memory);
      const nova = fundirAnalise(memoria, {
        company: classificacao.company, role: classificacao.role, primary_pain: classificacao.primary_pain, budget: classificacao.budget,
        decision_timeline: classificacao.decision_timeline, desired_outcome: classificacao.desired_outcome, interests: classificacao.interests,
        objections: classificacao.objections, score: classificacao.score, summary: classificacao.summary, next_best_action: "",
      });
      await admin.from("contacts").update({ client_memory: nova }).eq("id", call.contact_id).eq("org_id", call.org_id)
        .filter("client_memory->interaction_summary->>analyses", memoria.interaction_summary.analyses ? "eq" : "is", memoria.interaction_summary.analyses ? String(memoria.interaction_summary.analyses) : null);
      if (call.deal_id) await preencherBant(admin, call.org_id, call.deal_id, classificacao);
    }

    // Campanha: fecha a linha do contato.
    if (call.campaign_id) {
      const statusCampanha = status === "completed" ? "completed" : "no_answer";
      await admin.from("voice_campaign_contacts").update({ status: statusCampanha }).eq("call_id", call.id);
      await admin.rpc("incrementar_campanha_voz", { p_campaign: call.campaign_id, p_campo: statusCampanha === "completed" ? "completed" : "failed" });
    }
    return json({ ok: true, status, category: classificacao.category, transcript: transcript.length });
  } catch (err) {
    console.error("[voice-call-finalize]", err);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
