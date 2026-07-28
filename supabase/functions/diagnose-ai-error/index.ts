// Diagnostica uma resposta ruim da IA e sugere correção no system prompt.
//
// Acionada pelo "Reportar resposta" no inbox. Lê o prompt vigente, a mensagem
// problemática e o contexto em volta, e devolve qual bloco provavelmente causou
// o problema mais um trecho de correção.
//
// LIMITE DESTA FUNÇÃO: o bloco apontado é uma HIPÓTESE do modelo, não um
// diagnóstico determinístico. Nada aqui prova causalidade — a UI apresenta o
// resultado como sugestão a revisar, e aplicar sempre cria nova versão do
// prompt, para poder desfazer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarIA, ErroIA, extrairJson } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BLOCOS = [
  "role", "company", "core_philosophy", "sector_context",
  "guidelines", "cognitive_process", "output_format", "examples",
];

const CATEGORIA_LABEL: Record<string, string> = {
  informacao_incorreta: "Informação incorreta",
  tom_inadequado: "Tom inadequado",
  prometeu_indevido: "Prometeu algo que não devia",
  ignorou_regra: "Ignorou uma regra de comportamento",
  outro: "Outro",
};

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
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { data: profile } = await admin
      .from("profiles").select("org_id, crm_role").eq("id", user.id).maybeSingle();
    const orgId = profile?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const { message_id, categoria, descricao } = await req.json().catch(() => ({}));
    if (!message_id) return json({ error: "Informe message_id." }, 400);

    // A mensagem reportada, escopada por org — sem isso daria para diagnosticar
    // conversa de outra organização passando um id qualquer.
    const { data: mensagem } = await admin
      .from("conversation_messages")
      .select("id, conversation_id, org_id, content, direction, is_from_ai, sent_at")
      .eq("id", message_id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!mensagem) return json({ error: "Mensagem não encontrada" }, 404);
    if (!mensagem.is_from_ai) {
      return json({ error: "Só faz sentido diagnosticar mensagem gerada pela IA." }, 400);
    }

    // Contexto: as 5 mensagens anteriores à reportada.
    const { data: contexto } = await admin
      .from("conversation_messages")
      .select("direction, content, is_from_ai, sent_at")
      .eq("conversation_id", mensagem.conversation_id)
      .lt("sent_at", mensagem.sent_at as string)
      .order("sent_at", { ascending: false })
      .limit(5);

    const { data: config } = await admin
      .from("ai_messaging_config")
      .select("system_prompt")
      .eq("org_id", orgId)
      .maybeSingle();

    const systemPrompt = (config?.system_prompt as string | null)?.trim();
    if (!systemPrompt) {
      return json({
        error: "Esta organização ainda não tem system prompt configurado. Configure em Configurações > IA.",
      }, 400);
    }

    const historico = (contexto ?? [])
      .slice()
      .reverse()
      .map((m) => `${m.is_from_ai ? "IA" : m.direction === "inbound" ? "Cliente" : "Equipe"}: ${m.content}`)
      .join("\n");

    const prompt = `Você é especialista em depurar system prompts de assistentes de IA.

Uma resposta da IA foi reportada como problemática. Analise e identifique qual
bloco do prompt provavelmente causou o problema, e proponha uma correção cirúrgica.

SYSTEM PROMPT VIGENTE:
${systemPrompt}

CONTEXTO DA CONVERSA (mensagens anteriores):
${historico || "(sem mensagens anteriores)"}

RESPOSTA REPORTADA COMO PROBLEMÁTICA:
${mensagem.content}

CATEGORIA DO PROBLEMA: ${CATEGORIA_LABEL[String(categoria)] ?? "Outro"}
DESCRIÇÃO DE QUEM REPORTOU: ${String(descricao ?? "").trim() || "(não informada)"}

REGRAS DA ANÁLISE
- O bloco deve ser um destes: ${BLOCOS.join(", ")}.
- A correção deve ser um trecho CURTO e específico, pronto para inserir no bloco.
  Nada de reescrever o prompt inteiro.
- Se o prompt já cobria o caso e a IA simplesmente não seguiu, diga isso
  explicitamente em "causa" — nem todo erro se corrige com mais instrução.
- Seja honesto sobre incerteza: se houver mais de uma causa plausível, diga.

Responda SOMENTE com JSON válido, sem cercas de código:
{"bloco":"guidelines","causa":"explicação curta do que faltou ou falhou","sugestao":"trecho a inserir no bloco","confianca":"alta|media|baixa"}`;

    const { texto } = await chamarIA({
      tarefa: "estruturado",
      maxTokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const parsed = extrairJson(texto);
    if (!parsed) return json({ error: "A IA não devolveu um diagnóstico legível." }, 502);

    const bloco = String(parsed.bloco ?? "");
    return json({
      ok: true,
      // Bloco fora da lista vira vazio: melhor a UI dizer "não identificado" do
      // que apontar um bloco que não existe no prompt.
      bloco: BLOCOS.includes(bloco) ? bloco : null,
      causa: String(parsed.causa ?? ""),
      sugestao: String(parsed.sugestao ?? ""),
      confianca: ["alta", "media", "baixa"].includes(String(parsed.confianca))
        ? String(parsed.confianca)
        : "baixa",
    });
  } catch (err) {
    if (err instanceof ErroIA) return json({ error: err.publico }, err.status);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
