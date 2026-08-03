import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";

export type VozElevenLabs = {
  voice_id: string;
  name: string;
  labels: string[];
  preview_url: string | null;
};

/** Erro com código para a UI distinguir "sem chave" de falha de API. */
export class ErroVozes extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "ErroVozes";
  }
}

const ehPortugues = (voz: VozElevenLabs) =>
  voz.labels.some((l) => /portug|brazil|brasil/i.test(l)) || /portug|brasil/i.test(voz.name);

/**
 * Vozes disponíveis na conta ElevenLabs da organização.
 *
 * A chave nunca chega ao frontend: a listagem vem da edge function
 * `elevenlabs-voices`. Vozes com rótulo em português vêm primeiro.
 */
export function useElevenLabsVoices(enabled = true) {
  return useQuery({
    queryKey: ["elevenlabs-voices"],
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<VozElevenLabs[]> => {
      const { data, error } = await supabase.functions.invoke("elevenlabs-voices", { body: {} });
      if (error) {
        const detalhe = await erroDeFunction(error, "Não foi possível listar as vozes.");
        throw new ErroVozes(detalhe.message, "error");
      }
      if (data?.error_code) {
        throw new ErroVozes(data.message ?? "Falha ao listar as vozes.", data.error_code);
      }
      const vozes: VozElevenLabs[] = data?.voices ?? [];
      return [...vozes].sort((a, b) => {
        const diff = Number(ehPortugues(b)) - Number(ehPortugues(a));
        return diff !== 0 ? diff : a.name.localeCompare(b.name, "pt-BR");
      });
    },
  });
}
