import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import type { Database } from "@/integrations/supabase/types";

export type EmailSettings = Database["public"]["Tables"]["email_settings"]["Row"];
export type EmailProvider = "resend" | "gmail";

/** Configurações > E-mail: provedor de envio da organização e remetente. */
export function useEmailSettings() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["email-settings", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<EmailSettings | null> => {
      const { data, error } = await supabase
        .from("email_settings")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useSaveEmailSettings() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { provider?: EmailProvider; from_name?: string | null; from_email?: string | null; reply_to?: string | null }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase
        .from("email_settings")
        .upsert({ org_id: orgId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-settings", orgId] }),
  });
}

export interface DomainStatus {
  domain: string;
  found: boolean;
  verified: boolean;
  status: string;
  records: { record: string; name: string; type: string; value: string; status: string | null }[];
}

/** Consulta o Resend e diz se o domínio do remetente está verificado. */
export function useCheckEmailDomain() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DomainStatus> => {
      const { data, error } = await supabase.functions.invoke("email-settings", { body: { action: "domain_status" } });
      if (error) throw await erroDeFunction(error, "Não foi possível consultar o domínio.");
      if (data?.error) throw new Error(data.error);
      return data as DomainStatus;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-settings", orgId] }),
  });
}

/** Manda um e-mail de teste para o próprio usuário pelo provedor configurado. */
export function useSendTestEmail() {
  return useMutation({
    mutationFn: async (): Promise<{ provider: EmailProvider; to: string }> => {
      const { data, error } = await supabase.functions.invoke("email-settings", { body: { action: "send_test" } });
      if (error) throw await erroDeFunction(error, "Não foi possível enviar o teste.");
      if (data?.error) throw new Error(data.error);
      return data as { provider: EmailProvider; to: string };
    },
  });
}
