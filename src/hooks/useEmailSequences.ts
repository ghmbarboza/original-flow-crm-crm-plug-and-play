import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type EmailSequence = Database["public"]["Tables"]["email_sequences"]["Row"];
export type SequenceStep = Database["public"]["Tables"]["email_sequence_steps"]["Row"];

export interface SequenceWithCounts extends EmailSequence {
  stepCount: number;
  enrolledCount: number;
}

/** Passo com o nome do template embutido para exibição. */
export interface SequenceStepWithTemplate extends SequenceStep {
  template: { id: string; name: string } | null;
}

export function useEmailSequences() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["email-sequences", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<SequenceWithCounts[]> => {
      const { data, error } = await supabase
        .from("email_sequences")
        .select("*, steps:email_sequence_steps(count), enrollments:email_sequence_enrollments(count)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => {
        const row = s as unknown as EmailSequence & {
          steps: { count: number }[];
          enrollments: { count: number }[];
        };
        return {
          ...row,
          stepCount: row.steps?.[0]?.count ?? 0,
          enrolledCount: row.enrollments?.[0]?.count ?? 0,
        };
      });
    },
  });
}

export function useSequenceSteps(sequenceId: string | null) {
  return useQuery({
    queryKey: ["sequence-steps", sequenceId],
    enabled: !!sequenceId,
    queryFn: async (): Promise<SequenceStepWithTemplate[]> => {
      const { data, error } = await supabase
        .from("email_sequence_steps")
        .select("*, template:email_templates(id, name)")
        .eq("sequence_id", sequenceId!)
        .order("order");
      if (error) throw error;
      return (data ?? []) as unknown as SequenceStepWithTemplate[];
    },
  });
}

export function useSaveSequence() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; is_active?: boolean }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("email_sequences")
          .update({ name: input.name, ...(input.is_active !== undefined ? { is_active: input.is_active } : {}) })
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("email_sequences")
        .insert({ org_id: orgId, name: input.name })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-sequences", orgId] }),
  });
}

export function useDeleteSequence() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-sequences", orgId] }),
  });
}

export function useSaveSequenceStep() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      sequence_id: string;
      delay_days: number;
      template_id: string | null;
      order: number;
    }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("email_sequence_steps")
          .update({ delay_days: input.delay_days, template_id: input.template_id, order: input.order })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_sequence_steps").insert({
          org_id: orgId,
          sequence_id: input.sequence_id,
          delay_days: input.delay_days,
          template_id: input.template_id,
          order: input.order,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, input) => {
      queryClient.invalidateQueries({ queryKey: ["sequence-steps", input.sequence_id] });
      queryClient.invalidateQueries({ queryKey: ["email-sequences", orgId] });
    },
  });
}

export function useDeleteSequenceStep() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; sequence_id: string }) => {
      const { error } = await supabase.from("email_sequence_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      queryClient.invalidateQueries({ queryKey: ["sequence-steps", input.sequence_id] });
      queryClient.invalidateQueries({ queryKey: ["email-sequences", orgId] });
    },
  });
}

/** Inscreve contatos na sequência (ignora quem já está inscrito e ativo). */
export function useEnrollContacts() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sequenceId, contactIds }: { sequenceId: string; contactIds: string[] }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (contactIds.length === 0) return { enrolled: 0 };

      const { data: existing } = await supabase
        .from("email_sequence_enrollments")
        .select("contact_id")
        .eq("sequence_id", sequenceId)
        .in("contact_id", contactIds)
        .eq("status", "active");
      const already = new Set((existing ?? []).map((e) => e.contact_id));
      const toEnroll = contactIds.filter((id) => !already.has(id));
      if (toEnroll.length === 0) return { enrolled: 0 };

      const { error } = await supabase.from("email_sequence_enrollments").insert(
        toEnroll.map((contact_id) => ({
          org_id: orgId,
          sequence_id: sequenceId,
          contact_id,
          status: "active",
        })),
      );
      if (error) throw error;
      return { enrolled: toEnroll.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-sequences", orgId] }),
  });
}
