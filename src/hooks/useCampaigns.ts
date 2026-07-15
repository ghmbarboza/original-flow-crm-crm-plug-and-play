import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  sending: "Enviando",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export function useCampaigns() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["campaigns", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CreateCampaignInput {
  name: string;
  message_template: string;
  /** "all" (todos os contatos com WhatsApp) ou "tag" (por tag). */
  audience_type: "all" | "tag";
  source_tag_id?: string | null;
  scheduled_at?: string | null;
}

/**
 * Cria a campanha e materializa a lista de destinatários a partir do público.
 *
 * Só faz sentido para contas Meta (a API oficial permite envio em massa). Os
 * destinatários viram linhas em campaign_recipients; o disparo em si é feito
 * pela edge function campaign-dispatcher.
 */
export function useCreateCampaign() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => {
      if (!orgId) throw new Error("Organização não carregada.");

      // Resolve o público em contatos com WhatsApp.
      let query = supabase
        .from("contacts")
        .select("id, whatsapp_phone")
        .eq("org_id", orgId)
        .is("merged_into_id", null)
        .not("whatsapp_phone", "is", null);

      if (input.audience_type === "tag" && input.source_tag_id) {
        const { data: tagged } = await supabase
          .from("contact_tags")
          .select("contact_id")
          .eq("tag_id", input.source_tag_id);
        const ids = (tagged ?? []).map((t) => t.contact_id);
        if (ids.length === 0) throw new Error("Nenhum contato com essa tag.");
        query = query.in("id", ids);
      }

      const { data: contacts, error: contactsError } = await query;
      if (contactsError) throw contactsError;

      const recipients = (contacts ?? []).filter((c) => c.whatsapp_phone);
      if (recipients.length === 0) throw new Error("Nenhum contato com WhatsApp no público selecionado.");

      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert({
          org_id: orgId,
          name: input.name,
          message_template: input.message_template,
          audience_type: input.audience_type,
          source_tag_id: input.source_tag_id ?? null,
          scheduled_at: input.scheduled_at ?? null,
          status: input.scheduled_at ? "scheduled" : "draft",
          total_recipients: recipients.length,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: recipientsError } = await supabase.from("campaign_recipients").insert(
        recipients.map((c) => ({
          org_id: orgId,
          campaign_id: campaign.id,
          contact_id: c.id,
          phone_number: c.whatsapp_phone!,
          status: "pending",
        })),
      );
      if (recipientsError) throw recipientsError;

      return { id: campaign.id, total: recipients.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns", orgId] }),
  });
}

/** Dispara (ou agenda o disparo imediato) de uma campanha via edge function. */
export function useSendCampaign() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke("campaign-dispatcher", {
        body: { campaign_id: campaignId },
      });
      if (error) throw new Error(error.message ?? "Falha ao disparar a campanha.");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns", orgId] }),
  });
}

export function useCancelCampaign() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns", orgId] }),
  });
}
