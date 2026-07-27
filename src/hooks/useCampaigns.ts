import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";
import type { CampaignChannel, CampaignProvider } from "@/lib/campaign-channels";

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
  /** "all" (todos os contatos alcançáveis no canal) ou "tag" (por tag). */
  audience_type: "all" | "tag";
  source_tag_id?: string | null;
  scheduled_at?: string | null;
  /** Canal do disparo. Não muda depois de criada. */
  channel: CampaignChannel;
  /** Quem entrega a campanha. */
  provider: CampaignProvider;
  /** Template aprovado. Obrigatório no WhatsApp via Zernio, opcional na Meta. */
  template_name?: string | null;
  template_language?: string | null;
}

/** Destinatário resolvido: sempre tem contato e identificador no canal. */
interface ResolvedRecipient {
  contactId: string;
  /** Telefone no WhatsApp; id da plataforma nos demais canais. */
  identifier: string;
}

/**
 * Resolve o público em destinatários alcançáveis NAQUELE canal.
 *
 * WhatsApp casa por whatsapp_phone. Os demais canais casam pelo identificador
 * de plataforma que o Sprint 7 passou a guardar em
 * contacts.custom_fields.channel_contact_id, junto de custom_fields.channel.
 */
async function resolveAudience(
  orgId: string,
  channel: string,
  audienceType: "all" | "tag",
  sourceTagId: string | null | undefined,
): Promise<ResolvedRecipient[]> {
  let query = supabase
    .from("contacts")
    .select("id, whatsapp_phone, custom_fields")
    .eq("org_id", orgId)
    .is("merged_into_id", null);

  if (channel === "whatsapp") {
    query = query.not("whatsapp_phone", "is", null);
  } else {
    query = query
      .eq("custom_fields->>channel", channel)
      .not("custom_fields->>channel_contact_id", "is", null);
  }

  if (audienceType === "tag" && sourceTagId) {
    const { data: tagged } = await supabase
      .from("contact_tags")
      .select("contact_id")
      .eq("tag_id", sourceTagId);
    const ids = (tagged ?? []).map((t) => t.contact_id);
    if (ids.length === 0) throw new Error("Nenhum contato com essa tag.");
    query = query.in("id", ids);
  }

  const { data: contacts, error } = await query;
  if (error) throw error;

  return (contacts ?? [])
    .map((c) => {
      const custom = (c.custom_fields ?? {}) as Record<string, unknown>;
      const identifier = channel === "whatsapp"
        ? (c.whatsapp_phone ?? "")
        : String(custom.channel_contact_id ?? "");
      return { contactId: c.id, identifier };
    })
    .filter((r) => r.identifier);
}

/** Quantos contatos a campanha alcançaria no canal — usado na revisão do wizard. */
export function useAudiencePreview(
  channel: string,
  audienceType: "all" | "tag",
  sourceTagId: string | null,
  enabled: boolean,
) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["audience-preview", orgId, channel, audienceType, sourceTagId],
    enabled: !!orgId && enabled,
    queryFn: async () => {
      const recipients = await resolveAudience(orgId!, channel, audienceType, sourceTagId);
      return recipients.length;
    },
  });
}

/**
 * Cria a campanha e materializa a lista de destinatários a partir do público.
 *
 * Vale para os provedores oficiais (Meta e Zernio) — a Evolution não permite
 * envio em massa. Os destinatários viram linhas em campaign_recipients; o
 * disparo em si é feito pela edge function campaign-dispatcher.
 */
export function useCreateCampaign() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => {
      if (!orgId) throw new Error("Organização não carregada.");

      const recipients = await resolveAudience(
        orgId, input.channel, input.audience_type, input.source_tag_id,
      );
      if (recipients.length === 0) {
        const what = input.channel === "whatsapp"
          ? "com WhatsApp"
          : `alcançáveis no ${input.channel}`;
        throw new Error(`Nenhum contato ${what} no público selecionado.`);
      }

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
          channel: input.channel,
          provider: input.provider,
          template_name: input.template_name ?? null,
          template_language: input.template_language ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: recipientsError } = await supabase.from("campaign_recipients").insert(
        recipients.map((r) => ({
          org_id: orgId,
          campaign_id: campaign.id,
          contact_id: r.contactId,
          // phone_number é NOT NULL e histórico: para canais sem telefone ele
          // recebe o mesmo identificador, e channel_contact_id guarda o valor
          // com a semântica correta para o dispatcher.
          phone_number: r.identifier,
          channel_contact_id: input.channel === "whatsapp" ? null : r.identifier,
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
