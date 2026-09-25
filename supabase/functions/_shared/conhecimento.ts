// Base de conhecimento da IA (Sprint 12 B10): fatos canônicos no prompt e
// busca híbrida sob demanda pelas ferramentas buscar_conhecimento e
// registrar_duvida. Porte do nina-engine.ts da Nina Zernio para o CRM.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { FerramentaIA } from "./ai.ts";

const LIMITE_BUSCA = 6;
const MAX_CONSULTA = 300;
const MAX_PERGUNTA = 500;
const MAX_CONTEXTO = 1000;
const MAX_FATOS_NO_PROMPT = 80;

export interface FatoCanonico {
  category: string;
  question: string | null;
  fact: string;
}

export interface ResultadoBusca {
  source_type: "fact" | "chunk" | "faq" | "objection";
  source_id: string;
  title: string;
  content: string;
  rank: number;
}

/** Fatos confirmados, vigentes e marcados para entrar sempre no prompt. */
export async function carregarFatosCanonicos(admin: SupabaseClient, orgId: string): Promise<FatoCanonico[]> {
  const agora = new Date().toISOString();
  const { data } = await admin
    .from("knowledge_facts")
    .select("category, question, fact")
    .eq("org_id", orgId)
    .eq("status", "confirmed")
    .eq("is_active", true)
    .eq("always_include", true)
    .lte("valid_from", agora)
    .or(`expires_at.is.null,expires_at.gt.${agora}`)
    .order("category")
    .limit(MAX_FATOS_NO_PROMPT);
  return (data ?? []) as FatoCanonico[];
}

/**
 * Bloco do system prompt: regras de verdade + fatos canônicos por categoria.
 * Sem fatos, o bloco aponta para as ferramentas.
 */
export function blocoDeVerdade(fatos: FatoCanonico[]): string {
  const regras = [
    "## REGRAS DE VERDADE (INEGOCIÁVEIS)",
    "1. Os FATOS CANÔNICOS abaixo são a única fonte confiável para preços, links, horários, endereços, condições e números. Cite-os exatamente como estão escritos, sem arredondar nem parafrasear valores.",
    "2. Para qualquer pergunta factual que NÃO esteja coberta pelos FATOS CANÔNICOS, chame a ferramenta buscar_conhecimento ANTES de responder.",
    "3. Se a busca não devolver a informação, NÃO INVENTE. Diga com naturalidade que vai confirmar com a equipe e chame registrar_duvida. Continue a conversa normalmente.",
    "4. Nunca crie preços, descontos, prazos, links, telefones ou capacidades de produto que não estejam nos FATOS ou nos resultados de busca.",
  ];
  if (fatos.length === 0) {
    return [...regras, "", "## FATOS CANÔNICOS", "(nenhum fato cadastrado ainda: use buscar_conhecimento e registre dúvidas com registrar_duvida)"].join("\n");
  }
  const porCategoria = new Map<string, FatoCanonico[]>();
  for (const f of fatos) {
    const lista = porCategoria.get(f.category) ?? [];
    lista.push(f);
    porCategoria.set(f.category, lista);
  }
  const linhas: string[] = ["", "## FATOS CANÔNICOS"];
  for (const [categoria, lista] of porCategoria) {
    linhas.push(`### ${categoria}`);
    // Corte de reserva: o banco já limita o fato a 2.000 caracteres.
    for (const f of lista) { const fato = f.fact.slice(0, 2000); linhas.push(f.question ? `- ${f.question.slice(0, 500)} → ${fato}` : `- ${fato}`); }
  }
  return [...regras, ...linhas].join("\n");
}

export const FERRAMENTAS_CONHECIMENTO: FerramentaIA[] = [
  {
    name: "buscar_conhecimento",
    description:
      "Busca na base de conhecimento oficial da empresa (fatos, FAQ, objeções e documentos). USE SEMPRE antes de responder qualquer pergunta factual sobre preços, produtos, condições, prazos, links, endereços ou políticas que não estejam nos FATOS CANÔNICOS. Nunca responda de memória.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Pergunta ou termos de busca em português (ex.: 'preço do plano anual', 'política de cancelamento')" },
      },
      required: ["query"],
    },
  },
  {
    name: "registrar_duvida",
    description:
      "Registra uma pergunta do cliente que você NÃO conseguiu responder com os FATOS CANÔNICOS nem com buscar_conhecimento. Use sempre que precisar dizer 'vou confirmar com a equipe'. Isso alimenta a base da empresa.",
    parameters: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "A pergunta do cliente, reformulada de forma clara" },
        contexto: { type: "string", description: "Contexto breve da conversa que gerou a dúvida" },
      },
      required: ["pergunta"],
    },
  },
];

/** Executa buscar_conhecimento e devolve o JSON que o modelo lê. */
export async function buscarConhecimento(admin: SupabaseClient, orgId: string, args: Record<string, unknown>): Promise<string> {
  const consulta = String(args.query ?? "").trim().slice(0, MAX_CONSULTA);
  if (!consulta) return JSON.stringify({ encontrado: false, aviso: "Informe o que buscar." });
  const { data, error } = await admin.rpc("buscar_conhecimento", { p_org: orgId, p_consulta: consulta, p_limite: LIMITE_BUSCA });
  if (error) return JSON.stringify({ encontrado: false, aviso: `Busca indisponível no momento (${error.message}). Diga que vai confirmar com a equipe.` });
  const resultados = (data ?? []) as ResultadoBusca[];
  if (resultados.length === 0) {
    return JSON.stringify({
      encontrado: false,
      aviso: "Nada encontrado na base de conhecimento. NÃO invente a resposta: diga que vai confirmar com a equipe e use registrar_duvida.",
    });
  }
  // A busca é tolerante (aceita erro de digitação e palavras parecidas), então
  // pode devolver trechos vizinhos que não respondem. Sem esta instrução a IA lia,
  // dizia "não encontrei" e não registrava a dúvida (estresse de 25/09/2026).
  return JSON.stringify({
    encontrado: true,
    instrucao: "Use só o que estiver escrito nestes trechos. Se nenhum deles responde exatamente à pergunta, NÃO invente: diga que vai confirmar com a equipe e chame registrar_duvida com a pergunta do cliente.",
    resultados: resultados.map((r) => ({ tipo: r.source_type, fonte: r.title, conteudo: r.content })),
  });
}

/** Executa registrar_duvida: grava em unanswered_questions. */
export async function registrarDuvida(
  admin: SupabaseClient,
  ref: { orgId: string; conversationId: string | null; contactId: string | null },
  args: Record<string, unknown>,
): Promise<string> {
  const pergunta = String(args.pergunta ?? "").trim().slice(0, MAX_PERGUNTA);
  if (!pergunta) return JSON.stringify({ ok: false, aviso: "Informe a pergunta." });
  const contexto = String(args.contexto ?? "").trim().slice(0, MAX_CONTEXTO) || null;
  const { error } = await admin.from("unanswered_questions").insert({
    org_id: ref.orgId, conversation_id: ref.conversationId, contact_id: ref.contactId, question: pergunta, context: contexto, kind: "question",
  });
  if (error) return JSON.stringify({ ok: false, aviso: `Não foi possível registrar (${error.message}).` });
  return JSON.stringify({ ok: true, instrucao: "Diga ao cliente, com naturalidade, que vai confirmar essa informação com a equipe e volta a falar. Não invente a resposta." });
}
