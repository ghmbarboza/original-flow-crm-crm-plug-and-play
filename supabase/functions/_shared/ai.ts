// Ponto único de chamada de LLM das edge functions.
//
// POR QUE ISSO EXISTE: as três functions de IA (ai-reply, generate-system-prompt,
// diagnose-ai-error) falavam direto com a API da Anthropic e exigiam o secret
// ANTHROPIC_API_KEY, que nunca foi configurado neste projeto — as três
// respondiam 500 e o wizard de setup ficava intransponível no passo 3.
//
// ESCOLHA DE PROVEDOR (nesta ordem):
//   1. ANTHROPIC_API_KEY configurada  → API da Anthropic direta.
//   2. LOVABLE_API_KEY presente       → AI Gateway do Lovable.
// A chave da Lovable é provisionada automaticamente no projeto, então o caminho
// 2 funciona sem ninguém configurar nada. O caminho 1 existe para quem quiser
// rodar em Claude: basta cadastrar o secret no Supabase e as três functions
// passam a usá-lo, sem alteração de código nem de tela.
//
// CONSEQUÊNCIA QUE VALE SABER: o Gateway não serve modelos Claude — só Google e
// OpenAI. Então, sem o secret da Anthropic, a IA do produto não é Claude. Os
// prompts das três functions são agnósticos de fornecedor (pedem JSON ou texto
// puro), mas a redação das respostas muda de modelo para modelo.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// "chat" = resposta curta para cliente, prioriza latência.
// "estruturado" = geração longa em JSON/XML, prioriza fidelidade ao formato.
export type TarefaIA = "chat" | "estruturado";

// Modelos padrão por provedor e tarefa. Todos sobrescrevíveis por env para
// trocar de modelo sem redeploy de código.
//
// POR QUE `estruturado` no Gateway NÃO é o gemini-2.5-pro: medido em produção,
// a geração do system prompt no passo 3 do wizard levava 56,0s e 63,2s com o
// pro, contra 18,5s a 29,0s com o flash. Um minuto de espera no meio do
// onboarding é inaceitável, e a comparação das saídas não justificou o custo:
// os dois entregaram os 8 blocos completos, 4 FAQs e 3 objeções, com a mesma
// estrutura XML. O flash foi validado antes de virar default.
//
// Se a fidelidade ao formato passar a falhar em algum setor, o caminho é
// `AI_GATEWAY_MODEL=google/gemini-2.5-pro`, que reverte sem redeploy — foi
// exatamente assim que esta troca entrou, antes de ser fixada aqui.
const PADRAO = {
  gateway: { chat: "google/gemini-2.5-flash", estruturado: "google/gemini-2.5-flash" },
  anthropic: { chat: "claude-opus-4-8", estruturado: "claude-sonnet-5" },
} as const;

export interface MensagemIA {
  role: "user" | "assistant";
  content: string;
}

export interface PedidoIA {
  /** Instrução de sistema. No Gateway vira a primeira mensagem com role "system". */
  system?: string;
  messages: MensagemIA[];
  maxTokens: number;
  tarefa: TarefaIA;
}

export interface RespostaIA {
  texto: string;
  provedor: "anthropic" | "gateway";
  modelo: string;
}

/**
 * Erro de IA com mensagem já pronta para o usuário final.
 *
 * As functions repassam `publico` na resposta HTTP. Sem isso, cada uma
 * inventaria seu próprio texto para "sem créditos" e "muitas requisições", e o
 * usuário veria mensagens diferentes para a mesma causa.
 */
export class ErroIA extends Error {
  constructor(
    readonly status: number,
    readonly publico: string,
    detalhe?: string,
  ) {
    super(detalhe ?? publico);
    this.name = "ErroIA";
  }
}

function modelo(provedor: "anthropic" | "gateway", tarefa: TarefaIA): string {
  const override = provedor === "gateway"
    ? Deno.env.get("AI_GATEWAY_MODEL")
    : Deno.env.get("AI_ANTHROPIC_MODEL");
  return override?.trim() || PADRAO[provedor][tarefa];
}

/** Traduz falhas do provedor em mensagens que dizem o que fazer a respeito. */
function traduzirFalha(provedor: string, status: number, corpo: string): ErroIA {
  if (status === 429) {
    return new ErroIA(429, "A IA está recebendo muitas requisições agora. Tente de novo em alguns segundos.", corpo);
  }
  if (status === 402) {
    return new ErroIA(402, "Os créditos de IA do projeto acabaram. Recarregue para continuar usando os recursos de IA.", corpo);
  }
  if (status === 401 || status === 403) {
    return new ErroIA(502, "A credencial de IA foi recusada pelo provedor. Verifique a configuração do projeto.", `${provedor}: ${corpo}`);
  }
  return new ErroIA(502, "A IA não respondeu como esperado. Tente de novo.", `${provedor} ${status}: ${corpo.slice(0, 300)}`);
}

async function viaAnthropic(p: PedidoIA, apiKey: string): Promise<RespostaIA> {
  const m = modelo("anthropic", p.tarefa);
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: m,
      max_tokens: p.maxTokens,
      ...(p.system ? { system: p.system } : {}),
      messages: p.messages,
    }),
  });

  if (!resp.ok) throw traduzirFalha("anthropic", resp.status, await resp.text());

  const payload = await resp.json();
  const texto: string = (payload.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");
  return { texto, provedor: "anthropic", modelo: m };
}

async function viaGateway(p: PedidoIA, apiKey: string): Promise<RespostaIA> {
  const m = modelo("gateway", p.tarefa);
  // Formato compatível com OpenAI: o system vai como primeira mensagem, não
  // como campo separado.
  const messages = p.system
    ? [{ role: "system", content: p.system }, ...p.messages]
    : p.messages;

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: m, messages, max_tokens: p.maxTokens }),
  });

  if (!resp.ok) throw traduzirFalha("gateway", resp.status, await resp.text());

  const payload = await resp.json();
  const texto: string = payload?.choices?.[0]?.message?.content ?? "";
  return { texto, provedor: "gateway", modelo: m };
}

/**
 * Chama o LLM pelo provedor disponível.
 *
 * Lança ErroIA — quem chama repassa `.status` e `.publico` na resposta HTTP.
 */
export async function chamarIA(p: PedidoIA): Promise<RespostaIA> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (anthropicKey) return await viaAnthropic(p, anthropicKey);

  const lovableKey = Deno.env.get("LOVABLE_API_KEY")?.trim();
  if (lovableKey) return await viaGateway(p, lovableKey);

  // Sem nenhum dos dois não há como degradar: é configuração ausente, e dizer
  // qual resolve poupa o próximo a investigar.
  throw new ErroIA(
    500,
    "Nenhum provedor de IA configurado. Cadastre ANTHROPIC_API_KEY no Supabase para usar Claude, ou garanta que LOVABLE_API_KEY esteja disponível no projeto.",
  );
}

/** Extrai JSON tolerando cercas de código, que vários modelos adicionam sozinhos. */
export function extrairJson(texto: string): Record<string, unknown> | null {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(limpo);
  } catch {
    const i = limpo.indexOf("{");
    const f = limpo.lastIndexOf("}");
    if (i === -1 || f <= i) return null;
    try {
      return JSON.parse(limpo.slice(i, f + 1));
    } catch {
      return null;
    }
  }
}
