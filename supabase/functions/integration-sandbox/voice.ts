// Twilio e ElevenLabs falsos para o hard smoke da voz (Sprint 12 B13).
// Caminhos na sandbox: /twilio/<caminho real> e /elevenlabs/<caminho real>.
// A ligação de saída devolve callSid e conversation_id previsíveis; a conversa
// devolve uma transcrição em que o cliente cita orçamento e prazo.

type Resposta = { status: number; body: unknown; raw?: Uint8Array } | null;

export const ELEVEN_AGENT_FALSO = "agent_e2e_0001";
export const ELEVEN_PHONE_FALSO = "phnum_e2e_0001";
const MP3_FALSO = Uint8Array.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

export function respostaVoz(caminho: string, metodo: string, corpo: Record<string, unknown> | null, query: URLSearchParams): Resposta {
  if (caminho.startsWith("/twilio/")) {
    const rota = caminho.slice("/twilio".length);
    if (/\/AvailablePhoneNumbers\/[A-Z]{2}\/Local\.json$/.test(rota)) {
      const area = query.get("AreaCode") ?? "48";
      return { status: 200, body: { available_phone_numbers: [
        { phone_number: `+55${area}30000001`, friendly_name: `(${area}) 3000-0001`, locality: "Florianópolis", region: "SC" },
        { phone_number: `+55${area}30000002`, friendly_name: `(${area}) 3000-0002`, locality: "Florianópolis", region: "SC" },
      ] } };
    }
    if (rota.endsWith("/IncomingPhoneNumbers.json") && metodo === "POST") {
      return { status: 201, body: { sid: `PN${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`, phone_number: corpo?.PhoneNumber ?? null } };
    }
    if (rota.endsWith("/IncomingPhoneNumbers.json") && metodo === "GET") {
      const numero = query.get("PhoneNumber");
      return { status: 200, body: { incoming_phone_numbers: numero ? [{ sid: "PNe2eimportado0001", phone_number: numero }] : [] } };
    }
    return { status: 404, body: { message: `sandbox twilio: ${metodo} ${rota} não simulado` } };
  }

  if (caminho.startsWith("/elevenlabs/")) {
    const rota = caminho.slice("/elevenlabs".length);
    if (rota === "/v1/convai/agents/create" && metodo === "POST") return { status: 200, body: { agent_id: ELEVEN_AGENT_FALSO } };
    if (rota.startsWith("/v1/convai/agents/") && metodo === "PATCH") return { status: 200, body: { agent_id: rota.split("/").pop() } };
    if (rota === "/v1/convai/phone-numbers/create" && metodo === "POST") {
      if (!corpo?.sid || !corpo?.token) return { status: 400, body: { detail: { message: "sid e token do Twilio são obrigatórios" } } };
      return { status: 200, body: { phone_number_id: ELEVEN_PHONE_FALSO } };
    }
    if (rota.startsWith("/v1/convai/phone-numbers/") && (metodo === "PATCH" || metodo === "DELETE")) return { status: 200, body: { phone_number_id: rota.split("/").pop() } };
    if (rota === "/v1/convai/twilio/outbound-call" && metodo === "POST") {
      if (!corpo?.agent_id || !corpo?.agent_phone_number_id || !corpo?.to_number) return { status: 400, body: { detail: { message: "agent_id, agent_phone_number_id e to_number são obrigatórios" } } };
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
      return { status: 200, body: { success: true, message: "Ligação iniciada", conversation_id: `conv_e2e_${id}`, callSid: `CA${id}` } };
    }
    const conv = rota.match(/^\/v1\/convai\/conversations\/([^/]+)(\/audio)?$/);
    if (conv && metodo === "GET") {
      if (conv[2]) return { status: 200, body: null, raw: MP3_FALSO };
      return { status: 200, body: {
        conversation_id: conv[1], status: "done",
        transcript: [
          { role: "agent", message: "Oi! Aqui é a assistente. Posso falar um minutinho sobre a organização do atendimento?", time_in_call_secs: 0 },
          { role: "user", message: "Pode sim. Sou o Bruno, gerente da Oficina Norte. A gente perde cliente por demora na resposta.", time_in_call_secs: 6 },
          { role: "agent", message: "Entendi. Vocês têm um valor em mente por mês?", time_in_call_secs: 14 },
          { role: "user", message: "Dá pra investir uns dois mil por mês, e queria resolver isso ainda este mês.", time_in_call_secs: 19 },
          { role: "agent", message: "Perfeito, vou registrar aqui e a equipe te manda a proposta. Obrigada!", time_in_call_secs: 27 },
        ],
        analysis: { transcript_summary: "Bruno, gerente da Oficina Norte, quer resolver a demora no atendimento; orçamento de dois mil por mês e decisão este mês." },
        metadata: { call_duration_secs: 31 },
      } };
    }
    if (conv && metodo === "DELETE") return { status: 200, body: { ok: true } };
    return { status: 404, body: { detail: { message: `sandbox elevenlabs: ${metodo} ${rota} não simulado` } } };
  }
  return null;
}
