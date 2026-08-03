import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useOrgId } from "@/hooks/useOrgId";

/**
 * Chaves de API por ORGANIZAÇÃO (ex.: ElevenLabs para voz/transcrição).
 *
 * O valor da chave vive no Vault e NUNCA volta para o frontend — aqui só se
 * sabe se existe um registro para o serviço na organização. A leitura é possível
 * porque `api_keys_registry` tem uma policy de SELECT por organização; o segredo
 * em si só é lido pelas edge functions com service_role.
 */
export function useOrgApiKey(service: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org-api-key", orgId, service],
    enabled: !!orgId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("api_keys_registry")
        .select("service_name, is_active")
        .eq("org_id", orgId!)
        .eq("service_name", service)
        .limit(1);
      if (error) throw error;
      return (data ?? []).some((r) => r.is_active !== false);
    },
  });
}

/** Grava/atualiza a chave da organização no Vault via edge function. */
export function useSaveOrgApiKey(service: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (apiKey: string) => {
      const chave = apiKey.trim();
      if (!chave) throw new Error("Informe a chave antes de salvar.");
      const { data, error } = await supabase.functions.invoke("store-api-key", {
        body: { service_name: service, api_key: chave, label: service },
      });
      if (error) throw new Error((await erroDeFunction(error, "Falha ao salvar a chave.")).message);
      if (!data?.success) throw new Error(data?.error ?? "Falha ao salvar a chave.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-api-key", orgId, service] }),
  });
}
