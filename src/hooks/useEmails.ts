import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type Email = Database["public"]["Tables"]["emails"]["Row"];

/** Uma thread agrupada: o email mais recente + contagem + contato. */
export interface EmailThread {
  threadId: string;
  latest: Email;
  count: number;
  contact: { id: string; first_name: string; last_name: string | null } | null;
}

interface EmailRow extends Email {
  contact: { id: string; first_name: string; last_name: string | null } | null;
}

/** Lista de emails da org com contato embutido (base para agrupar em threads). */
function useEmailList() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["email-threads", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<EmailRow[]> => {
      const { data, error } = await supabase
        .from("emails")
        .select("*, contact:contacts(id, first_name, last_name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmailRow[];
    },
  });
}

/** Agrupa os emails em threads (o mais recente representa a thread). */
export function useEmailThreads() {
  const { data: emails, ...rest } = useEmailList();

  const threads = useMemo<EmailThread[]>(() => {
    const map = new Map<string, EmailThread>();
    for (const email of emails ?? []) {
      const key = email.thread_id ?? email.id;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { threadId: key, latest: email, count: 1, contact: email.contact });
      }
    }
    return [...map.values()].sort(
      (a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime(),
    );
  }, [emails]);

  return { data: threads, ...rest };
}

/** Todos os emails de uma thread, em ordem cronológica. */
export function useThreadEmails(threadId: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["thread-emails", threadId],
    enabled: !!threadId && !!orgId,
    queryFn: async (): Promise<Email[]> => {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("org_id", orgId!)
        .or(`thread_id.eq.${threadId},id.eq.${threadId}`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Envia um email via Gmail (edge function send-email) e registra em `emails`. */
export function useSendEmail() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      to: string;
      subject: string;
      body_html: string;
      contact_id?: string | null;
      deal_id?: string | null;
      thread_id?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-email", { body: input });
      if (error) throw new Error(error.message ?? "Falha ao enviar o email.");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["email-threads", orgId] });
      if (input.thread_id) queryClient.invalidateQueries({ queryKey: ["thread-emails", input.thread_id] });
      if (input.contact_id) queryClient.invalidateQueries({ queryKey: ["contact_timeline", input.contact_id] });
    },
  });
}
