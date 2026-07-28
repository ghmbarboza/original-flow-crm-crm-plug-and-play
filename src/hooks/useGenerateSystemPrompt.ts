import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FaqGerada {
  question: string;
  answer: string;
}
export interface ObjecaoGerada {
  objection: string;
  response: string;
}
export interface PromptGerado {
  system_prompt: string;
  faqs: FaqGerada[];
  objections: ObjecaoGerada[];
}

/** Blocos que o prompt gerado deve conter, na ordem em que aparecem. */
export const PROMPT_BLOCKS = [
  { key: "role", label: "Persona", icon: "🤖" },
  { key: "company", label: "Empresa", icon: "🏢" },
  { key: "core_philosophy", label: "Filosofia de atendimento", icon: "🎯" },
  { key: "sector_context", label: "Conhecimento do setor", icon: "📚" },
  { key: "guidelines", label: "Regras de comportamento", icon: "📋" },
  { key: "cognitive_process", label: "Processo de raciocínio", icon: "🧠" },
  { key: "output_format", label: "Formato da resposta", icon: "✍️" },
  { key: "examples", label: "Exemplos", icon: "💬" },
] as const;

export type BlockKey = (typeof PROMPT_BLOCKS)[number]["key"];

/**
 * Quebra o prompt XML nos blocos, para edição separada.
 *
 * O que estiver fora dos blocos conhecidos (o wrapper <system_instruction>,
 * por exemplo) é preservado na remontagem — descartar silenciosamente
 * corromperia o prompt de quem editasse.
 */
export function splitBlocks(prompt: string): Record<string, string> {
  const blocos: Record<string, string> = {};
  for (const { key } of PROMPT_BLOCKS) {
    const match = prompt.match(new RegExp(`<${key}>([\\s\\S]*?)</${key}>`));
    blocos[key] = match ? match[1].trim() : "";
  }
  return blocos;
}

/** Remonta o prompt a partir dos blocos editados, preservando a ordem. */
export function joinBlocks(blocos: Record<string, string>): string {
  const corpo = PROMPT_BLOCKS
    .filter(({ key }) => blocos[key]?.trim())
    .map(({ key }) => `<${key}>\n${blocos[key].trim()}\n</${key}>`)
    .join("\n\n");
  return `<system_instruction>\n${corpo}\n</system_instruction>`;
}

/**
 * Gera o system prompt a partir do contexto da organização.
 *
 * A função de backend não persiste nada — o retorno é rascunho, e quem salva é
 * a etapa do wizard depois da revisão do usuário.
 */
export function useGenerateSystemPrompt() {
  return useMutation({
    mutationFn: async (agentName?: string): Promise<PromptGerado> => {
      const { data, error } = await supabase.functions.invoke("generate-system-prompt", {
        body: { agent_name: agentName },
      });
      if (error) throw new Error(error.message ?? "Falha ao gerar o prompt.");
      if (data?.error) throw new Error(data.error);
      return {
        system_prompt: data.system_prompt as string,
        faqs: (data.faqs ?? []) as FaqGerada[],
        objections: (data.objections ?? []) as ObjecaoGerada[],
      };
    },
  });
}
