import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ContactStatus = Database["public"]["Enums"]["contact_status"];
type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];

export interface Contact extends ContactRow {
  company: { id: string; name: string } | null;
  contact_tags: { tag: { id: string; name: string; color: string } | null }[];
}

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  lead: "Lead",
  prospect: "Prospect",
  customer: "Cliente",
  churned: "Perdido",
};

const SELECT = `
  *,
  company:companies(id, name),
  contact_tags(tag:tags(id, name, color))
` as const;

export function useContacts() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  // O tópico precisa ser único por instância do hook: dois componentes montados ao
  // mesmo tempo (lista e Grupos) reusariam o mesmo canal e o segundo tentaria
  // registrar `postgres_changes` depois do `subscribe()` do primeiro — o que lança.
  const instanceId = useId();

  // Realtime: o guia exige contacts em tempo real. Invalida a lista quando outro
  // usuário (ou o webhook do WhatsApp) cria/edita um contato.
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`contacts:${orgId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contacts", filter: `org_id=eq.${orgId}` },
        () => queryClient.invalidateQueries({ queryKey: ["contacts", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient, instanceId]);

  return useQuery({
    queryKey: ["contacts", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from("contacts")
        .select(SELECT)
        .eq("org_id", orgId!)
        // Contatos absorvidos por um merge somem da lista, mas seguem no banco.
        .is("merged_into_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Contact[];
    },
  });
}

export function useContact(id: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["contact", id],
    enabled: !!id && !!orgId,
    queryFn: async (): Promise<Contact | null> => {
      const { data, error } = await supabase
        .from("contacts")
        .select(SELECT)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Contact | null;
    },
  });
}

export function useCreateContact() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<ContactInsert, "org_id">) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data, error } = await supabase
        .from("contacts")
        .insert({ ...input, org_id: orgId })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts", orgId] }),
  });
}

export function useUpdateContact() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<ContactInsert>) => {
      const { error } = await supabase
        .from("contacts")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["contacts", orgId] });
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
    },
  });
}

export function useDeleteContact() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts", orgId] }),
  });
}

/** Importação CSV: insere em lote e devolve quantos entraram. */
export function useImportContacts() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: Omit<ContactInsert, "org_id">[]) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      if (rows.length === 0) return { inserted: 0 };

      const { data, error } = await supabase
        .from("contacts")
        .insert(rows.map((r) => ({ ...r, org_id: orgId })))
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts", orgId] }),
  });
}

/**
 * Merge manual de contatos (Admin).
 *
 * Não apaga o duplicado: reaponta os vínculos para o sobrevivente e marca o
 * absorvido com `merged_into_id`, preservando o histórico. Campos vazios do
 * sobrevivente são preenchidos com o dado do absorvido — "o dado mais recente
 * prevalece, mas nada se perde".
 */
export function useMergeContacts() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ keepId, mergeId }: { keepId: string; mergeId: string }) => {
      if (keepId === mergeId) throw new Error("Selecione dois contatos diferentes.");

      const { data: both, error: loadError } = await supabase
        .from("contacts")
        .select("*")
        .in("id", [keepId, mergeId]);
      if (loadError) throw loadError;

      const keep = both?.find((c) => c.id === keepId);
      const merged = both?.find((c) => c.id === mergeId);
      if (!keep || !merged) throw new Error("Contato não encontrado.");

      // Preenche buracos do sobrevivente com os dados do absorvido.
      const fill: Record<string, unknown> = {};
      for (const field of ["last_name", "email", "phone", "whatsapp_phone", "title", "company_id", "source"] as const) {
        if (!keep[field] && merged[field]) fill[field] = merged[field];
      }

      // Reaponta os vínculos. Tags usam upsert-ignore: o par pode já existir no sobrevivente.
      await supabase.from("activities").update({ contact_id: keepId }).eq("contact_id", mergeId);
      await supabase.from("deals").update({ contact_id: keepId }).eq("contact_id", mergeId);
      await supabase.from("emails").update({ contact_id: keepId }).eq("contact_id", mergeId);

      const { data: mergedTags } = await supabase
        .from("contact_tags").select("tag_id").eq("contact_id", mergeId);
      if (mergedTags?.length) {
        await supabase
          .from("contact_tags")
          .upsert(
            mergedTags.map((t) => ({ contact_id: keepId, tag_id: t.tag_id })),
            { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
          );
        await supabase.from("contact_tags").delete().eq("contact_id", mergeId);
      }

      if (Object.keys(fill).length > 0) {
        const { error } = await supabase
          .from("contacts")
          .update({ ...fill, updated_at: new Date().toISOString() })
          .eq("id", keepId);
        if (error) throw error;
      }

      const { error: markError } = await supabase
        .from("contacts")
        .update({ merged_into_id: keepId, updated_at: new Date().toISOString() })
        .eq("id", mergeId);
      if (markError) throw markError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contacts", orgId] }),
  });
}
