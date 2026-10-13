import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ApiKeyRegistryRow {
  service_name: string;
  label: string | null;
  is_active: boolean | null;
}

export const API_KEYS_REGISTRY_KEY = ["api-keys-registry"] as const;

/** Chaves de API guardadas no cofre da organização (nunca o valor da chave). */
export function useApiKeysRegistry() {
  return useQuery({
    queryKey: API_KEYS_REGISTRY_KEY,
    queryFn: async (): Promise<ApiKeyRegistryRow[]> => {
      const { data, error } = await supabase
        .from("api_keys_registry")
        .select("service_name, label, is_active");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * O botão "+ Nova chave" (topo da aba) e a lista (fim da aba) são componentes
 * separados; a invalidação compartilhada é o que mantém os dois em sincronia.
 */
export function useInvalidateApiKeysRegistry() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: API_KEYS_REGISTRY_KEY });
    // O status "Voz da agente" e o VoicePicker derivam de ["org-api-key", ...];
    // com staleTime Infinity, sem esta invalidação o card só atualiza com F5.
    queryClient.invalidateQueries({ queryKey: ["org-api-key"] });
    // Cards que conferem várias chaves de uma vez (Twilio, Nylas, IA).
    queryClient.invalidateQueries({ queryKey: ["org-api-keys-lote"] });
  };
}