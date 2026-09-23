// Voz (Sprint 12 B13): números, agente de voz e ligações. Chamada pelo front
// com sessão de admin (ligações de saída também por membros).
//
// Ações (POST { action, ... }):
//   status            → agente (sem segredos), números, se as credenciais estão prontas
//   numbers_search    { country?, area_code?, contains? } → números disponíveis no Twilio
//   numbers_buy       { phone_number, label? } → compra no Twilio e importa no ElevenLabs
//   numbers_import    { phone_number, label? } → número que a org já tem no Twilio
//   number_update     { phone_number_id, inbound_behavior?, forward_to?, outbound_enabled?, label? }
//   number_release    { phone_number_id } → apaga no ElevenLabs (mantém no Twilio) e no CRM
//   agent_sync        → cria/atualiza o agente no ElevenLabs com o prompt compilado
//   call_outbound     { contact_id, phone_number_id?, purpose?, instruction? } → liga pela IA
//   call_cancel       { call_id }
//
// api_base só é aceito quando aponta a integration-sandbox deste projeto.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ErroVoz, type AgenteVoz, compilarPromptDeVoz, corpoDoAgente, credenciaisVoz, e164, elevenFetch, ferramentasDeVoz, twilioFetch,
} from "../_shared/voz.ts";
import { carregarPolitica } from "../_shared/agenda.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function apiBaseAceita(valor: unknown): string | null {
  const prefixo = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integration-sandbox/`;
  return typeof valor === "string" && valor.startsWith(prefixo) ? valor : null;
}

function webhookUrl(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/voice-webhook`;
}

async function agenteDaOrg(admin: SupabaseClient, orgId: string, apiBase: string | null): Promise<AgenteVoz> {
  const { data } = await admin.from("voice_agents").select("*").eq("org_id", orgId).maybeSingle();
  if (data) {
    if (apiBase && data.api_base !== apiBase) await admin.from("voice_agents").update({ api_base: apiBase }).eq("org_id", orgId);
    return { ...(data as AgenteVoz), api_base: apiBase ?? (data.api_base as string | null) };
  }
  const { data: criado, error } = await admin.from("voice_agents").insert({ org_id: orgId, api_base: apiBase }).select("*").single();
  if (error || !criado) throw new ErroVoz(500, error?.message ?? "Falha ao criar o agente de voz.");
  return criado as AgenteVoz;
}

function publico(a: AgenteVoz) {
  const { webhook_secret: _s, api_base: _b, ...resto } = a;
  return resto;
}

/** Cria ou atualiza o agente no ElevenLabs. Devolve o id. */
export async function sincronizarAgente(admin: SupabaseClient, orgId: string, agente: AgenteVoz): Promise<string> {
  const cred = await credenciaisVoz(admin, orgId);
  const { prompt, agentName, companyName } = await compilarPromptDeVoz(admin, orgId, agente.prompt_extra);
  const politica = await carregarPolitica(admin, orgId);
  const corpo = corpoDoAgente({
    nome: `${companyName} · ${agentName} (FlowCRM)`, prompt, firstMessage: agente.first_message, voiceId: agente.voice_id, language: agente.language,
    maxDuration: agente.max_duration_seconds, tools: ferramentasDeVoz(webhookUrl(), orgId, agente.webhook_secret, politica.ai_enabled),
    webhookUrl: webhookUrl(), orgId, secret: agente.webhook_secret,
  });
  try {
    let agentId = agente.elevenlabs_agent_id;
    if (agentId) {
      await elevenFetch(cred, agente, `/v1/convai/agents/${agentId}`, { method: "PATCH", body: JSON.stringify(corpo) });
    } else {
      const r = await elevenFetch(cred, agente, "/v1/convai/agents/create", { method: "POST", body: JSON.stringify(corpo) });
      agentId = String(r.agent_id ?? "");
      if (!agentId) throw new ErroVoz(502, "ElevenLabs não devolveu o id do agente.");
    }
    await admin.from("voice_agents").update({ elevenlabs_agent_id: agentId, synced_at: new Date().toISOString(), last_error: null }).eq("org_id", orgId);
    return agentId;
  } catch (e) {
    await admin.from("voice_agents").update({ last_error: e instanceof Error ? e.message : String(e) }).eq("org_id", orgId);
    throw e;
  }
}

/** Importa o número no ElevenLabs (com as credenciais Twilio da org) e liga ao agente. */
async function registrarNumero(admin: SupabaseClient, orgId: string, agente: AgenteVoz, numeroId: string, e164Num: string, label: string | null) {
  const cred = await credenciaisVoz(admin, orgId);
  const agentId = agente.elevenlabs_agent_id ?? await sincronizarAgente(admin, orgId, agente);
  const r = await elevenFetch(cred, agente, "/v1/convai/phone-numbers/create", {
    method: "POST", body: JSON.stringify({ phone_number: e164Num, label: label ?? e164Num, provider: "twilio", sid: cred.twilioSid, token: cred.twilioToken }),
  });
  const phoneId = String(r.phone_number_id ?? "");
  if (!phoneId) throw new ErroVoz(502, "ElevenLabs não devolveu o id do número.");
  await elevenFetch(cred, agente, `/v1/convai/phone-numbers/${phoneId}`, { method: "PATCH", body: JSON.stringify({ agent_id: agentId }) });
  await admin.from("phone_numbers").update({ elevenlabs_phone_number_id: phoneId, status: "active", updated_at: new Date().toISOString() }).eq("id", numeroId);
  return phoneId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader ? await admin.auth.getUser(authHeader.replace("Bearer ", "")) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: perfil } = await admin.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = perfil?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);
    const { data: ehAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const apiBase = apiBaseAceita(body.api_base);
    const agente = await agenteDaOrg(admin, orgId, apiBase);

    if (action === "status") {
      const { data: numeros } = await admin.from("phone_numbers").select("*").eq("org_id", orgId).order("created_at");
      let credenciais: { ok: boolean; motivo?: string } = { ok: true };
      try { await credenciaisVoz(admin, orgId); } catch (e) { credenciais = { ok: false, motivo: e instanceof Error ? e.message : String(e) }; }
      return json({ ok: true, agent: publico(agente), numbers: numeros ?? [], credentials: credenciais, webhook_url: webhookUrl() });
    }

    if (action === "call_outbound") {
      const contactId = String(body.contact_id ?? "");
      const { data: contato } = await admin.from("contacts").select("id, first_name, last_name, whatsapp_phone, phone").eq("id", contactId).eq("org_id", orgId).maybeSingle();
      if (!contato) return json({ error: "Contato não encontrado." }, 404);
      const destino = e164(contato.whatsapp_phone) ?? e164(contato.phone);
      if (!destino) return json({ error: "O contato não tem telefone válido." }, 400);
      let q = admin.from("phone_numbers").select("*").eq("org_id", orgId).eq("status", "active").eq("outbound_enabled", true).not("elevenlabs_phone_number_id", "is", null);
      if (typeof body.phone_number_id === "string") q = q.eq("id", body.phone_number_id);
      const { data: numero } = await q.order("created_at").limit(1).maybeSingle();
      if (!numero) return json({ error: "Nenhum número pronto para ligar. Importe um número e conecte ao agente em Voz > Números." }, 400);
      if (!agente.elevenlabs_agent_id) return json({ error: "Sincronize o agente de voz antes de ligar." }, 400);
      const cred = await credenciaisVoz(admin, orgId);
      const purpose = ["sales", "reminder", "no_show", "campaign"].includes(String(body.purpose)) ? String(body.purpose) : "sales";
      const { data: deal } = await admin.from("deals").select("id").eq("org_id", orgId).eq("contact_id", contato.id).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: call, error } = await admin.from("calls").insert({
        org_id: orgId, contact_id: contato.id, deal_id: deal?.id ?? null, phone_number_id: numero.id, direction: "outbound", status: "queued",
        from_number: numero.e164, to_number: destino, purpose, created_by: user.id, metadata: { instruction: String(body.instruction ?? "").slice(0, 500) || null },
      }).select("id").single();
      if (error || !call) return json({ error: error?.message ?? "Falha ao registrar a ligação." }, 500);
      const { prompt: _p, agentName, companyName } = await compilarPromptDeVoz(admin, orgId, agente.prompt_extra);
      try {
        const r = await elevenFetch(cred, agente, "/v1/convai/twilio/outbound-call", {
          method: "POST",
          body: JSON.stringify({
            agent_id: agente.elevenlabs_agent_id, agent_phone_number_id: numero.elevenlabs_phone_number_id, to_number: destino,
            conversation_initiation_client_data: {
              dynamic_variables: {
                flowcrm_call_id: call.id, company_name: companyName, agent_name: agentName,
                lead_name: [contato.first_name, contato.last_name].filter(Boolean).join(" ") || "cliente",
                call_purpose: String(body.instruction ?? "").slice(0, 300) || (purpose === "sales" ? "entender a necessidade e oferecer ajuda" : purpose),
              },
            },
          }),
        });
        await admin.from("calls").update({
          status: "ringing", started_at: new Date().toISOString(), provider_call_sid: (r.callSid as string | undefined) ?? null,
          elevenlabs_conversation_id: (r.conversation_id as string | undefined) ?? null,
        }).eq("id", call.id);
        return json({ ok: true, call_id: call.id, conversation_id: r.conversation_id ?? null });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("calls").update({ status: "failed", ended_at: new Date().toISOString(), metadata: { error: msg } }).eq("id", call.id);
        return json({ error: msg }, e instanceof ErroVoz ? e.status : 502);
      }
    }

    if (action === "call_cancel") {
      const { data: call } = await admin.from("calls").select("id, elevenlabs_conversation_id, status").eq("id", String(body.call_id ?? "")).eq("org_id", orgId).maybeSingle();
      if (!call) return json({ error: "Ligação não encontrada." }, 404);
      if (call.elevenlabs_conversation_id) {
        const cred = await credenciaisVoz(admin, orgId);
        await elevenFetch(cred, agente, `/v1/convai/conversations/${call.elevenlabs_conversation_id}`, { method: "DELETE" }).catch(() => null);
      }
      await admin.from("calls").update({ status: "canceled", ended_at: new Date().toISOString() }).eq("id", call.id);
      return json({ ok: true });
    }

    if (!ehAdmin) return json({ error: "Apenas administradores configuram números e o agente de voz." }, 403);

    if (action === "agent_sync") {
      const agentId = await sincronizarAgente(admin, orgId, agente);
      return json({ ok: true, agent_id: agentId });
    }

    if (action === "numbers_search") {
      const cred = await credenciaisVoz(admin, orgId);
      const pais = String(body.country ?? "BR").toUpperCase().slice(0, 2);
      const params = new URLSearchParams({ VoiceEnabled: "true", PageSize: "20" });
      if (body.area_code) params.set("AreaCode", String(body.area_code));
      if (body.contains) params.set("Contains", String(body.contains));
      const r = await twilioFetch(cred, agente, `/AvailablePhoneNumbers/${pais}/Local.json?${params}`);
      const lista = (r.available_phone_numbers as { phone_number: string; friendly_name?: string; locality?: string; region?: string }[] | undefined) ?? [];
      return json({ ok: true, numbers: lista.map((n) => ({ phone_number: n.phone_number, friendly_name: n.friendly_name ?? n.phone_number, locality: n.locality ?? null, region: n.region ?? null })) });
    }

    if (action === "numbers_buy" || action === "numbers_import") {
      const cred = await credenciaisVoz(admin, orgId);
      const numeroE164 = e164(String(body.phone_number ?? ""));
      if (!numeroE164) return json({ error: "Informe o número no formato internacional (+55...)." }, 400);
      const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : null;
      let sid: string | null = null;
      if (action === "numbers_buy") {
        const r = await twilioFetch(cred, agente, "/IncomingPhoneNumbers.json", { method: "POST", form: { PhoneNumber: numeroE164, FriendlyName: label ?? "FlowCRM" } });
        sid = (r.sid as string | undefined) ?? null;
      } else {
        const r = await twilioFetch(cred, agente, `/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(numeroE164)}`);
        const lista = (r.incoming_phone_numbers as { sid: string }[] | undefined) ?? [];
        if (!lista.length) return json({ error: "Esse número não está na sua conta Twilio." }, 404);
        sid = lista[0].sid;
      }
      const { data: numero, error } = await admin.from("phone_numbers").upsert({
        org_id: orgId, e164: numeroE164, label, provider: "twilio", twilio_sid: sid, status: "pending", updated_at: new Date().toISOString(),
      }, { onConflict: "e164" }).select("id").single();
      if (error || !numero) return json({ error: error?.message ?? "Falha ao gravar o número." }, 500);
      try {
        const phoneId = await registrarNumero(admin, orgId, agente, numero.id, numeroE164, label);
        return json({ ok: true, phone_number_id: numero.id, elevenlabs_phone_number_id: phoneId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("phone_numbers").update({ status: "error", metadata: { error: msg } }).eq("id", numero.id);
        return json({ error: `Número gravado, mas não conectado ao agente: ${msg}`, phone_number_id: numero.id }, 502);
      }
    }

    const numeroId = String(body.phone_number_id ?? "");
    const { data: numero } = numeroId ? await admin.from("phone_numbers").select("*").eq("id", numeroId).eq("org_id", orgId).maybeSingle() : { data: null };
    if (!numero) return json({ error: "Número não encontrado." }, 404);

    if (action === "number_update") {
      const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (["ai_answer", "forward_to_agent", "voicemail"].includes(String(body.inbound_behavior))) campos.inbound_behavior = body.inbound_behavior;
      if (typeof body.forward_to === "string") campos.forward_to = e164(body.forward_to);
      if (typeof body.outbound_enabled === "boolean") campos.outbound_enabled = body.outbound_enabled;
      if (typeof body.label === "string") campos.label = body.label.trim().slice(0, 60) || null;
      const { error } = await admin.from("phone_numbers").update(campos).eq("id", numero.id);
      if (error) return json({ error: error.message }, 500);
      if (!numero.elevenlabs_phone_number_id && body.reconnect === true) {
        await registrarNumero(admin, orgId, agente, numero.id, numero.e164, numero.label);
      }
      return json({ ok: true });
    }

    if (action === "number_release") {
      if (numero.elevenlabs_phone_number_id) {
        const cred = await credenciaisVoz(admin, orgId);
        await elevenFetch(cred, agente, `/v1/convai/phone-numbers/${numero.elevenlabs_phone_number_id}`, { method: "DELETE" }).catch(() => null);
      }
      await admin.from("phone_numbers").delete().eq("id", numero.id);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    const status = err instanceof ErroVoz ? (err.status >= 400 && err.status < 500 ? err.status : 502) : 500;
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, status);
  }
});
