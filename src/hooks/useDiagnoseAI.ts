import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PROMPT_BLOCKS, joinBlocks, splitBlocks } from "@/hooks/useGenerateSystemPrompt";
import type { BlockKey } from "@/hooks/useGenerateSystemPrompt";

export const CATEGORIAS_ERRO = [
  { value: "informacao_incorreta", label: "Informação incorreta" },
  { value: "tom_inadequado", label: "Tom inadequado" },
  { value: "prometeu_indevido", label: "Prometeu algo que não devia" },
  { value: "ignorou_regra", label: "Ignorou uma regra de comportamento" },
  { value: "outro", label: "Outro" },
] as const;

export interface Diagnostico {
  /** null quando a IA não conseguiu apontar um bloco conhecido. */
  bloco: BlockKey | null;
  causa: string;
  sugestao: string;
  confianca: "alta" | "media" | "baixa";
}

export function blockLabel(key: string | null): string {
  return PROMPT_BLOCKS.find((b) => b.key === key)?.label ?? "não identificado";
}

export function useDiagnoseAIError() {
  return useMutation({
    mutationFn: async (input: {
      messageId: string;
      categoria: string;
      descricao?: string;
    }): Promise<Diagnostico> => {
      const { data, error } = await supabase.functions.invoke("diagnose-ai-error", {
        body: {
          message_id: input.messageId,
          categoria: input.categoria,
          descricao: input.descricao,
        },
      });
      if (error) throw new Error(error.message ?? "Falha ao diagnosticar.");
      if (data?.error) throw new Error(data.error);
      return data as Diagnostico;
    },
  });
}

/**
 * Insere a sugestão no bloco indicado do prompt vigente.
 *
 * Devolve o prompt novo em vez de gravar: quem grava é o upsert de configuração,
 * que já cuida de incrementar a versão e registrar no histórico. Duplicar essa
 * escrita aqui criaria dois caminhos de versionamento para divergir.
 *
 * Sem bloco identificado, a sugestão vai para <guidelines> — é onde regras de
 * comportamento moram, e é melhor que descartar o texto.
 */
export function aplicarSugestao(
  promptAtual: string,
  bloco: BlockKey | null,
  sugestao: string,
): string {
  const alvo: BlockKey = bloco ?? "guidelines";
  const blocos = splitBlocks(promptAtual);
  const conteudo = blocos[alvo]?.trim() ?? "";
  blocos[alvo] = conteudo ? `${conteudo}\n${sugestao.trim()}` : sugestao.trim();
  return joinBlocks(blocos);
}
