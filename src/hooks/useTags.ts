import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { VIA_STAGE_COLORS } from "@/lib/via-colors";

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export function useTags() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["tags", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, color")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTag() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data, error } = await supabase
        .from("tags")
        .insert({ org_id: orgId, name, color: color ?? VIA_STAGE_COLORS[0].value })
        .select("id, name, color")
        .single();
      if (error) {
        // UNIQUE(org_id, name): mensagem acionável em vez do erro cru do Postgres.
        if (error.code === "23505") throw new Error(`Já existe uma tag chamada "${name}".`);
        throw error;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags", orgId] }),
  });
}

export function useUpdateTag() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name?: string; color?: string }) => {
      const { error } = await supabase.from("tags").update({ name, color }).eq("id", id);
      if (error) {
        if (error.code === "23505") throw new Error(`Já existe uma tag chamada "${name}".`);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", orgId] });
      queryClient.invalidateQueries({ queryKey: ["contacts", orgId] });
    },
  });
}

export function useDeleteTag() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", orgId] });
      queryClient.invalidateQueries({ queryKey: ["contacts", orgId] });
    },
  });
}

/** Aplica o conjunto de tags de um contato: insere as novas, remove as retiradas. */
export function useSetContactTags() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, tagIds }: { contactId: string; tagIds: string[] }) => {
      const { data: current, error: loadError } = await supabase
        .from("contact_tags")
        .select("tag_id")
        .eq("contact_id", contactId);
      if (loadError) throw loadError;

      const currentIds = new Set((current ?? []).map((t) => t.tag_id));
      const nextIds = new Set(tagIds);

      const toAdd = tagIds.filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("contact_tags")
          .insert(toAdd.map((tag_id) => ({ contact_id: contactId, tag_id })));
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("contact_tags")
          .delete()
          .eq("contact_id", contactId)
          .in("tag_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: (_d, { contactId }) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", orgId] });
      queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
    },
  });
}
