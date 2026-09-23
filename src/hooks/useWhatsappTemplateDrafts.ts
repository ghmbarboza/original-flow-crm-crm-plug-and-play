import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useCreateMessageTemplate } from "@/hooks/useMessageTemplates";
import type { Database } from "@/integrations/supabase/types";

export type WhatsappTemplateDraft = Database["public"]["Tables"]["whatsapp_template_drafts"]["Row"];

/** Rascunhos de template gerados pelo kit inicial, à espera de envio para a Meta. */
export function useWhatsappTemplateDrafts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["whatsapp-template-drafts", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WhatsappTemplateDraft[]> => {
      const { data, error } = await supabase.from("whatsapp_template_drafts").select("*").eq("org_id", orgId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Envia o rascunho para aprovação pelo provedor oficial (Meta ou Zernio) e marca o status. */
export function useSubmitTemplateDraft() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const criar = useCreateMessageTemplate();
  return useMutation({
    mutationFn: async (d: WhatsappTemplateDraft) => {
      try {
        await criar.mutateAsync({
          name: d.name,
          category: (d.category as "MARKETING" | "UTILITY" | "AUTHENTICATION") ?? "UTILITY",
          language: d.language,
          body_text: d.body_text,
          example_params: (d.example_params as string[]) ?? [],
        });
        await supabase.from("whatsapp_template_drafts").update({ status: "submitted", submitted_at: new Date().toISOString(), error: null }).eq("id", d.id);
      } catch (e) {
        await supabase.from("whatsapp_template_drafts").update({ status: "error", error: e instanceof Error ? e.message : String(e) }).eq("id", d.id);
        throw e;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-template-drafts", orgId] }),
    onError: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-template-drafts", orgId] }),
  });
}

export function useDeleteTemplateDraft() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_template_drafts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-template-drafts", orgId] }),
  });
}
