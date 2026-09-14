import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ZernioConfig = Database["public"]["Tables"]["zernio_configs"]["Row"];

export interface ZernioAccount {
  id: string;
  platform: string;
  username: string | null;
  displayName: string | null;
  profilePicture: string | null;
  isActive: boolean;
  needsReconnection: boolean;
}

/** Config do Zernio da org (api_key nunca é exposta ao ler — só profile/status). */
export function useZernioConfig() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["zernio-config", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ZernioConfig | null> => {
      const { data, error } = await supabase
        .from("zernio_configs")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Salva (upsert) api_key + profile_id do Zernio. Escrita direta (RLS: admin da org). */
export function useSaveZernioConfig() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { api_key: string; profile_id: string }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase
        .from("zernio_configs")
        .upsert(
          {
            org_id: orgId,
            api_key: input.api_key,
            profile_id: input.profile_id,
            status: "active",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "org_id" },
        );
      if (error) throw error;

      // Sem o webhook cadastrado no Zernio nenhuma mensagem chega ao CRM, então
      // conectar só termina quando ele foi aceito.
      const { data, error: fnError } = await supabase.functions.invoke("zernio-register-webhook", { body: {} });
      if (fnError) throw await erroDeFunction(fnError, "Falha ao cadastrar o webhook no Zernio.");
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zernio-config", orgId] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-setup", orgId] });
    },
  });
}

/** Lista as contas conectadas no Zernio (via edge function zernio-list-accounts). */
export function useZernioAccounts(enabled: boolean) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["zernio-accounts", orgId],
    enabled: !!orgId && enabled,
    queryFn: async (): Promise<ZernioAccount[]> => {
      const { data, error } = await supabase.functions.invoke("zernio-list-accounts", { body: {} });
      if (error) throw await erroDeFunction(error, "Falha ao listar contas do Zernio.");
      if (data?.error) throw new Error(data.error);
      return (data?.accounts ?? []) as ZernioAccount[];
    },
  });
}

/** Pede ao Zernio a URL de OAuth para conectar um canal. */
export function useConnectZernioChannel() {
  return useMutation({
    mutationFn: async (channel: string): Promise<string> => {
      const { data, error } = await supabase.functions.invoke("zernio-connect-channel", {
        body: { channel, redirect_url: `${window.location.origin}/whatsapp` },
      });
      if (error) throw await erroDeFunction(error, "Falha ao conectar o canal.");
      if (data?.error) throw new Error(data.error);
      if (!data?.authUrl) throw new Error("Zernio não retornou a URL de autorização.");
      return data.authUrl as string;
    },
  });
}
