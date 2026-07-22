import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type EmailTemplate = Database["public"]["Tables"]["email_templates"]["Row"];
export type EmailTemplateInsert = Database["public"]["Tables"]["email_templates"]["Insert"];

export function useEmailTemplates() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["email-templates", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<EmailTemplate[]> => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveEmailTemplate() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id?: string; name: string; subject: string; body_html: string }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            name: input.name,
            subject: input.subject,
            body_html: input.body_html,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase.from("email_templates").insert({
          org_id: orgId,
          name: input.name,
          subject: input.subject,
          body_html: input.body_html,
          created_by: auth.user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-templates", orgId] }),
  });
}

export function useDeleteEmailTemplate() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-templates", orgId] }),
  });
}
