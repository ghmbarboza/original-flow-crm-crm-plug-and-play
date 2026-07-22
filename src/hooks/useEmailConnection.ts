import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type EmailConnection = Database["public"]["Tables"]["email_connections"]["Row"];

/** Conexão de email (Gmail) do usuário logado. */
export function useEmailConnection() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["email-connection", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<EmailConnection | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("email_connections")
        .select("*")
        .eq("org_id", orgId!)
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/**
 * Inicia a conexão com o Gmail.
 *
 * Pede à edge function `gmail-auth-url` o link de consentimento do Google (com
 * client_id, redirect e escopos gmail.readonly + gmail.send) e redireciona o
 * navegador. O callback (`gmail-oauth-callback`) troca o code por tokens e grava
 * em email_connections, depois volta para /inbox.
 */
export function useConnectGmail() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gmail-auth-url", {
        body: { redirect_path: "/inbox" },
      });
      if (error) throw new Error(error.message ?? "Não foi possível iniciar a conexão.");
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("URL de autenticação não retornada.");
      window.location.href = data.url as string;
    },
  });
}

export function useDisconnectGmail() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_connections").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-connection", orgId] }),
  });
}

/** Dispara uma sincronização das mensagens recentes do Gmail. */
export function useSyncGmail() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gmail-sync", { body: {} });
      if (error) throw new Error(error.message ?? "Falha ao sincronizar.");
      if (data?.error) throw new Error(data.error);
      return data as { synced: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-threads", orgId] });
    },
  });
}
