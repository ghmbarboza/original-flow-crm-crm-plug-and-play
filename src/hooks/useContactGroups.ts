import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Contact, ContactStatus } from "@/hooks/useContacts";

/**
 * Critérios de um grupo dinâmico. Um contato entra no grupo quando satisfaz
 * TODAS as condições preenchidas (as vazias são ignoradas).
 */
export interface GroupCriteria {
  status?: ContactStatus[];
  tagIds?: string[];
  minScore?: number;
  /** Sem atividade registrada há N dias — usa updated_at do contato. */
  inactiveDays?: number;
}

export interface ContactGroup {
  id: string;
  name: string;
  type: "fixed" | "dynamic";
  criteria: GroupCriteria;
  created_at: string | null;
}

export function useContactGroups() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["contact_groups", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ContactGroup[]> => {
      const { data, error } = await supabase
        .from("contact_groups")
        .select("id, name, type, criteria, created_at")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((g) => ({
        ...g,
        type: g.type as "fixed" | "dynamic",
        criteria: (g.criteria ?? {}) as GroupCriteria,
      }));
    },
  });
}

/** Membros de um grupo fixo (ids de contato). */
export function useGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["contact_group_members", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("contact_group_members")
        .select("contact_id")
        .eq("group_id", groupId!);
      if (error) throw error;
      return (data ?? []).map((m) => m.contact_id);
    },
  });
}

/**
 * Resolve os contatos de um grupo dinâmico sobre a lista já carregada.
 *
 * Avaliado no cliente de propósito: a lista de contatos já está em cache e os
 * critérios são poucos e baratos. Se o volume crescer a ponto de doer, isto vira
 * uma RPC no banco — o formato de `criteria` não muda.
 */
export function matchesCriteria(contact: Contact, criteria: GroupCriteria): boolean {
  if (criteria.status?.length && !criteria.status.includes(contact.status)) return false;

  if (criteria.tagIds?.length) {
    const contactTagIds = contact.contact_tags.map((ct) => ct.tag?.id).filter(Boolean) as string[];
    const hasAll = criteria.tagIds.every((id) => contactTagIds.includes(id));
    if (!hasAll) return false;
  }

  if (typeof criteria.minScore === "number" && contact.lead_score < criteria.minScore) return false;

  if (typeof criteria.inactiveDays === "number" && criteria.inactiveDays > 0) {
    const updatedAt = contact.updated_at ? new Date(contact.updated_at).getTime() : 0;
    const cutoff = Date.now() - criteria.inactiveDays * 24 * 60 * 60 * 1000;
    if (updatedAt > cutoff) return false;
  }

  return true;
}

export function useCreateGroup() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; type: "fixed" | "dynamic"; criteria?: GroupCriteria }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data, error } = await supabase
        .from("contact_groups")
        .insert({
          org_id: orgId,
          name: input.name,
          type: input.type,
          criteria: (input.criteria ?? {}) as never,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contact_groups", orgId] }),
  });
}

export function useDeleteGroup() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contact_groups", orgId] }),
  });
}

/** Adiciona/remove contatos de um grupo fixo. */
export function useSetGroupMembers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ groupId, contactIds }: { groupId: string; contactIds: string[] }) => {
      const { data: current, error: loadError } = await supabase
        .from("contact_group_members")
        .select("contact_id")
        .eq("group_id", groupId);
      if (loadError) throw loadError;

      const currentIds = new Set((current ?? []).map((m) => m.contact_id));
      const nextIds = new Set(contactIds);
      const toAdd = contactIds.filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("contact_group_members")
          .insert(toAdd.map((contact_id) => ({ group_id: groupId, contact_id })));
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("contact_group_members")
          .delete()
          .eq("group_id", groupId)
          .in("contact_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: (_d, { groupId }) =>
      queryClient.invalidateQueries({ queryKey: ["contact_group_members", groupId] }),
  });
}
