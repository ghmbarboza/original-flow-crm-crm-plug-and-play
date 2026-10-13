// Ponto único de chamada de LLM das edge functions.
//
// POR QUE ISSO EXISTE: as três functions de IA (ai-reply, generate-system-prompt,
// diagnose-ai-error) falavam direto com a API da Anthropic e exigiam o secret
// ANTHROPIC_API_KEY, que nunca foi configurado neste projeto — as três
// respondiam 500 e o wizard de setup ficava intransponível no passo 3.
//
// FILA DE PROVEDORES (tenta nesta ordem; se um falha, vai para o próximo):
//   1. Chaves da organização, cadastradas em Configurações > Integrações e
//      guardadas no Vault: Anthropic, depois OpenAI, depois Gemini.
//   2. ANTHROPIC_API_KEY do projeto   → API da Anthropic direta.
//   3. LOVABLE_API_KEY do projeto     → AI Gateway do Lovable.
// A chave da Lovable é provisionada automaticamente no projeto, então o último
// caminho funciona sem ninguém configurar nada e serve de reserva para quem
// cadastrou chave própria. A fila só anda enquanto nenhuma ferramenta rodou:
// recomeçar em outro provedor depois disso repetiria a ação (mover negócio,
// agendar) em nome do cliente.
//
// CONSEQUÊNCIA QUE VALE SABER: o Gateway não serve modelos Claude — só Google e
// OpenAI. Então, sem o secret da Anthropic, a IA do produto não é Claude. Os
// prompts das três functions são agnósticos de fornecedor (pedem JSON ou texto
// puro), mas a redação das respostas muda de modelo para modelo.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type ProvedorIA = "anthropic" | "openai" | "gemini" | "gateway";

// Os três falam o formato de chat da OpenAI; muda o endereço e o nome do campo
// de limite de tokens (a OpenAI aposentou max_tokens nos modelos novos).
const COMPATIVEIS: Record<Exclude<ProvedorIA, "anthropic">, { url: string; campoLimite: string }> = {
  gateway: { url: "https://ai.gateway.lovable.dev/v1/chat/completions", campoLimite: "max_tokens" },
  openai: { url: "https://api.openai.com/v1/chat/completions", campoLimite: "max_completion_tokens" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", campoLimite: "max_tokens" },
};

// Nome do serviço no Vault (api_keys_registry.service_name) de cada chave que a
// organização pode cadastrar. A ordem aqui é a ordem de preferência.
export const SERVICOS_DE_IA = {
  anthropic: "anthropic",
  openai: "openai",
  gemini: "gemini",
} as const;

const ENV_DO_MODELO: Record<ProvedorIA, string> = {
  gateway: "AI_GATEWAY_MODEL",
  anthropic: "AI_ANTHROPIC_MODEL",
  openai: "AI_OPENAI_MODEL",
  gemini: "AI_GEMINI_MODEL",
};

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
  openai: { chat: "gpt-4.1-mini", estruturado: "gpt-4.1" },
  gemini: { chat: "gemini-2.5-flash", estruturado: "gemini-2.5-flash" },
} as const;

export interface MensagemIA {
  role: "user" | "assistant";
  content: string;
}

/**
 * Ferramenta exposta ao modelo (function calling). `parameters` é JSON Schema;
 * cada provedor recebe no seu formato (input_schema na Anthropic, function no
 * Gateway/OpenAI). O loop de execução fica DENTRO de chamarIA: quem chama só
 * fornece o executor e recebe o texto final.
 */
export interface FerramentaIA {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Executa uma ferramenta chamada pelo modelo e devolve o resultado como texto. */
export type ExecutorFerramenta = (
  nome: string,
  args: Record<string, unknown>,
) => Promise<string>;

/** Rodadas máximas de tool-use por chamada — evita loop de ferramenta infinito. */
const MAX_RODADAS_FERRAMENTA = 4;

export interface PedidoIA {
  /** Instrução de sistema. No Gateway vira a primeira mensagem com role "system". */
  system?: string;
  messages: MensagemIA[];
  maxTokens: number;
  tarefa: TarefaIA;
  tools?: FerramentaIA[];
  executarFerramenta?: ExecutorFerramenta;
  /** Obriga o modelo a chamar alguma ferramenta na primeira rodada (antes de responder). */
  exigirFerramenta?: boolean;
  /**
   * Organização dona da chamada. Com ela, as chaves próprias cadastradas em
   * Integrações entram na frente da fila; sem ela, só as chaves do projeto.
   */
  organizacao?: { admin: SupabaseClient; orgId: string | null | undefined };
}

export interface RespostaIA {
  texto: string;
  provedor: ProvedorIA;
  modelo: string;
}

/** Um provedor pronto para ser chamado: qual, com que chave e de quem é a chave. */
export interface AlvoIA {
  provedor: ProvedorIA;
  apiKey: string;
  origem: "organizacao" | "projeto";
}

export type ChavesDaOrganizacao = Partial<Record<keyof typeof SERVICOS_DE_IA, string | null>>;

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

function modelo(provedor: ProvedorIA, tarefa: TarefaIA): string {
  return Deno.env.get(ENV_DO_MODELO[provedor])?.trim() || PADRAO[provedor][tarefa];
}

// Quanto do corpo de erro do provedor vai para o log (ele pode citar parte da chave).
const MAX_CORPO_NO_LOG = 300;

// Tempo que um provedor tem para responder quando ainda existe outro na fila.
// Sem isso, um provedor que trava (em vez de errar) consumiria o tempo todo da
// function e a reserva nunca seria tentada. O último da fila não tem limite.
const LIMITE_COM_RESERVA_MS = 45_000;

/** Traduz falhas do provedor em mensagens que dizem o que fazer a respeito. */
function traduzirFalha(provedor: string, status: number, corpo: string): ErroIA {
  if (status === 429) {
    return new ErroIA(429, "A IA está recebendo muitas requisições agora. Tente de novo em alguns segundos.", corpo);
  }
  if (status === 402) {
    return new ErroIA(402, "Os créditos de IA do projeto acabaram. Recarregue para continuar usando os recursos de IA.", corpo);
  }
  if (status === 401 || status === 403) {
    return new ErroIA(502, "A credencial de IA foi recusada pelo provedor. Verifique a configuração do projeto.", `${provedor} ${status}: ${corpo.slice(0, MAX_CORPO_NO_LOG)}`);
  }
  return new ErroIA(502, "A IA não respondeu como esperado. Tente de novo.", `${provedor} ${status}: ${corpo.slice(0, MAX_CORPO_NO_LOG)}`);
}

async function viaAnthropic(p: PedidoIA, apiKey: string, limiteMs?: number): Promise<RespostaIA> {
  const m = modelo("anthropic", p.tarefa);
  const comFerramentas = !!p.tools?.length && !!p.executarFerramenta;

  // Ao longo do loop de tool-use as mensagens deixam de ser só texto: a
  // resposta do assistente vira blocos (text + tool_use) e o resultado volta
  // como tool_result. Por isso o array interno é de conteúdo livre.
  const messages: Array<{ role: string; content: unknown }> = [...p.messages];

  for (let rodada = 0; ; rodada++) {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      ...(limiteMs ? { signal: AbortSignal.timeout(limiteMs) } : {}),
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: m,
        max_tokens: p.maxTokens,
        ...(p.system ? { system: p.system } : {}),
        ...(comFerramentas
          ? {
              tools: p.tools!.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
              ...(p.exigirFerramenta && rodada === 0 ? { tool_choice: { type: "any" } } : {}),
            }
          : {}),
        messages,
      }),
    });

    if (!resp.ok) throw traduzirFalha("anthropic", resp.status, await resp.text());

    const payload = await resp.json();
    const blocos: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> =
      payload.content ?? [];

    const usos = blocos.filter((b) => b.type === "tool_use");
    if (comFerramentas && payload.stop_reason === "tool_use" && usos.length > 0 && rodada < MAX_RODADAS_FERRAMENTA) {
      messages.push({ role: "assistant", content: blocos });
      const resultados = [];
      for (const uso of usos) {
        const resultado = await p.executarFerramenta!(uso.name ?? "", uso.input ?? {});
        resultados.push({ type: "tool_result", tool_use_id: uso.id, content: resultado });
      }
      messages.push({ role: "user", content: resultados });
      continue;
    }

    const texto = blocos
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return { texto, provedor: "anthropic", modelo: m };
  }
}

async function viaCompativel(
  p: PedidoIA, provedor: Exclude<ProvedorIA, "anthropic">, apiKey: string, limiteMs?: number,
): Promise<RespostaIA> {
  const m = modelo(provedor, p.tarefa);
  const { url, campoLimite } = COMPATIVEIS[provedor];
  const comFerramentas = !!p.tools?.length && !!p.executarFerramenta;

  // Formato compatível com OpenAI: o system vai como primeira mensagem, não
  // como campo separado.
  const messages: Array<Record<string, unknown>> = p.system
    ? [{ role: "system", content: p.system }, ...p.messages.map((msg) => ({ ...msg }))]
    : p.messages.map((msg) => ({ ...msg }));

  for (let rodada = 0; ; rodada++) {
    const resp = await fetch(url, {
      method: "POST",
      ...(limiteMs ? { signal: AbortSignal.timeout(limiteMs) } : {}),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: m,
        messages,
        [campoLimite]: p.maxTokens,
        ...(comFerramentas
          ? {
              tools: p.tools!.map((t) => ({
                type: "function",
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
              ...(p.exigirFerramenta && rodada === 0 ? { tool_choice: "required" } : {}),
            }
          : {}),
      }),
    });

    if (!resp.ok) throw traduzirFalha(provedor, resp.status, await resp.text());

    const payload = await resp.json();
    const message = payload?.choices?.[0]?.message ?? {};
    const toolCalls: Array<{ id: string; function?: { name?: string; arguments?: string } }> =
      message.tool_calls ?? [];

    if (comFerramentas && toolCalls.length > 0 && rodada < MAX_RODADAS_FERRAMENTA) {
      messages.push(message);
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function?.arguments ?? "{}");
        } catch {
          // Argumento malformado do modelo: executa com objeto vazio.
        }
        const resultado = await p.executarFerramenta!(call.function?.name ?? "", args);
        messages.push({ role: "tool", tool_call_id: call.id, content: resultado });
      }
      continue;
    }

    return { texto: message.content ?? "", provedor, modelo: m };
  }
}

/** Monta a fila: chaves da organização na ordem de preferência, depois as do projeto. */
export function filaDeProvedores(
  daOrganizacao: ChavesDaOrganizacao,
  doProjeto: { anthropic?: string | null; lovable?: string | null },
): AlvoIA[] {
  const fila: AlvoIA[] = [];
  for (const provedor of Object.keys(SERVICOS_DE_IA) as Array<keyof typeof SERVICOS_DE_IA>) {
    const apiKey = daOrganizacao[provedor]?.trim();
    if (apiKey) fila.push({ provedor, apiKey, origem: "organizacao" });
  }
  const anthropic = doProjeto.anthropic?.trim();
  if (anthropic) fila.push({ provedor: "anthropic", apiKey: anthropic, origem: "projeto" });
  const lovable = doProjeto.lovable?.trim();
  if (lovable) fila.push({ provedor: "gateway", apiKey: lovable, origem: "projeto" });
  return fila;
}

/** Chaves de IA que a organização cadastrou em Integrações (Vault). */
async function chavesDaOrganizacao(org: PedidoIA["organizacao"]): Promise<ChavesDaOrganizacao> {
  if (!org?.orgId) return {};
  // get_org_ai_keys só devolve chave cadastrada por administrador ativo da
  // organização (ver a migration): quem tem a chave em uso lê as conversas.
  const { data, error } = await org.admin.rpc("get_org_ai_keys", { _org_id: org.orgId });
  if (error) {
    // Segue com as chaves do projeto: o atendimento não para por isso.
    console.error("[ai] falha ao ler as chaves de IA da organização:", error.message);
    return {};
  }
  const linhas = (data ?? []) as Array<{ service_name: string; api_key: string | null }>;
  const chaves: ChavesDaOrganizacao = {};
  for (const [provedor, servico] of Object.entries(SERVICOS_DE_IA)) {
    chaves[provedor as keyof typeof SERVICOS_DE_IA] = linhas.find((l) => l.service_name === servico)?.api_key ?? null;
  }
  return chaves;
}

/**
 * Tenta cada provedor da fila até um responder.
 *
 * Só passa para o próximo se nenhuma ferramenta rodou na tentativa que falhou.
 * Quando todos falham, o erro devolvido é o do primeiro: é o provedor que a
 * pessoa escolheu, e é a mensagem dele que diz o que ela precisa resolver.
 */
export async function chamarComFila(p: PedidoIA, fila: AlvoIA[]): Promise<RespostaIA> {
  if (fila.length === 0) {
    throw new ErroIA(
      500,
      "Nenhum provedor de IA configurado. Cadastre uma chave em Configurações > Integrações ou garanta que LOVABLE_API_KEY esteja disponível no projeto.",
    );
  }

  let primeiroErro: unknown;
  for (const [posicao, alvo] of fila.entries()) {
    const limiteMs = posicao < fila.length - 1 ? LIMITE_COM_RESERVA_MS : undefined;
    let ferramentaRodou = false;
    const pedido: PedidoIA = p.executarFerramenta
      ? { ...p, executarFerramenta: (nome, args) => { ferramentaRodou = true; return p.executarFerramenta!(nome, args); } }
      : p;
    try {
      return alvo.provedor === "anthropic"
        ? await viaAnthropic(pedido, alvo.apiKey, limiteMs)
        : await viaCompativel(pedido, alvo.provedor, alvo.apiKey, limiteMs);
    } catch (erro) {
      const falha = erro instanceof ErroIA
        ? erro
        : new ErroIA(502, "A IA não respondeu como esperado. Tente de novo.", `${alvo.provedor}: ${erro instanceof Error ? erro.message : String(erro)}`);
      console.error(`[ai] ${alvo.provedor} (chave ${alvo.origem === "organizacao" ? "da organização" : "do projeto"}) falhou: ${falha.message}`);
      if (ferramentaRodou) throw falha;
      // Chave da organização: a mensagem aponta para onde a pessoa resolve, e
      // não para "os créditos do projeto", que não é o que falhou.
      primeiroErro ??= alvo.origem === "organizacao"
        ? new ErroIA(falha.status, `A IA não respondeu com a sua chave (${alvo.provedor}) nem pela reserva. Confira a chave e o saldo no provedor, em Configurações > Integrações.`, falha.message)
        : falha;
    }
  }
  throw primeiroErro;
}

/**
 * Chama o LLM pela fila de provedores disponíveis para a organização.
 *
 * Lança ErroIA — quem chama repassa `.status` e `.publico` na resposta HTTP.
 */
export async function chamarIA(p: PedidoIA): Promise<RespostaIA> {
  const fila = filaDeProvedores(await chavesDaOrganizacao(p.organizacao), {
    anthropic: Deno.env.get("ANTHROPIC_API_KEY"),
    lovable: Deno.env.get("LOVABLE_API_KEY"),
  });
  return await chamarComFila(p, fila);
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
