import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];
export type ApiRequestLog = Database["public"]["Tables"]["api_request_logs"]["Row"];

/** Escopos da API pública, com o que cada um libera. */
export const API_SCOPES: { value: string; label: string }[] = [
  { value: "contacts:read", label: "Ler contatos" },
  { value: "contacts:write", label: "Criar e atualizar contatos" },
  { value: "deals:read", label: "Ler negócios" },
  { value: "deals:write", label: "Criar, mover e atualizar negócios" },
  { value: "conversations:read", label: "Ler conversas e mensagens" },
  { value: "conversations:write", label: "Registrar, enviar mensagens e transferir conversas" },
  { value: "pipelines:read", label: "Ler funis e etapas" },
  { value: "activities:write", label: "Criar atividades" },
  { value: "products:read", label: "Ler produtos" },
  { value: "products:write", label: "Criar e atualizar produtos" },
  { value: "knowledge:read", label: "Ler base de conhecimento da IA" },
];

export function apiBaseUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;
}

export function useApiKeys() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["api-keys", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ApiKey[]> => {
      const { data, error } = await supabase.from("api_keys").select("*").eq("org_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Cria a chave pela RPC; o valor completo só existe nesta resposta. */
export function useCreateApiKey() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; scopes: string[]; rateLimit: number }): Promise<{ id: string; key: string }> => {
      const { data, error } = await supabase.rpc("criar_chave_api", { p_name: input.name, p_scopes: input.scopes, p_rate_limit: input.rateLimit });
      if (error) throw error;
      return data as unknown as { id: string; key: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys", orgId] }),
  });
}

export function useRevokeApiKey() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys", orgId] }),
  });
}

export function useApiRequestLogs(limit = 50) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["api-request-logs", orgId, limit],
    enabled: !!orgId,
    queryFn: async (): Promise<ApiRequestLog[]> => {
      const { data, error } = await supabase.from("api_request_logs").select("*").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
