import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ConversationStatus = Database["public"]["Enums"]["conversation_status"];
type ConversationRow = Database["public"]["Tables"]["whatsapp_conversations"]["Row"];
export type Message = Database["public"]["Tables"]["whatsapp_messages"]["Row"];

/** Conversa com o contato embutido para exibir nome/avatar na lista. */
export interface Conversation extends ConversationRow {
  contact: { id: string; first_name: string; last_name: string | null } | null;
}

const CONVERSATION_SELECT = `
  *,
  contact:contacts(id, first_name, last_name)
` as const;

/** Nome de exibição da conversa: contato, ou o número cru. */
export function conversationName(conversation: Conversation): string {
  if (conversation.contact) {
    const name = [conversation.contact.first_name, conversation.contact.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (name) return name;
  }
  return conversation.phone_number;
}

/** Lista de conversas da org, com realtime (inbox). */
export function useConversations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const instanceId = useId();

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`conversations:${orgId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations", filter: `org_id=eq.${orgId}` },
        () => queryClient.invalidateQueries({ queryKey: ["conversations", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient, instanceId]);

  return useQuery({
    queryKey: ["conversations", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(CONVERSATION_SELECT)
        .eq("org_id", orgId!)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: ["conversation", id],
    enabled: !!id,
    queryFn: async (): Promise<Conversation | null> => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select(CONVERSATION_SELECT)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Conversation | null;
    },
  });
}

/** Mensagens de uma conversa, com realtime (o painel de mensagens escuta aqui). */
export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();
  const instanceId = useId();

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages:${conversationId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["messages", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, instanceId]);

  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Envia uma mensagem do agente. Delega ao edge function do provedor
 * (`evolution-send-message` / `meta-send-message`), que registra em
 * `whatsapp_messages` e entrega ao provedor. Notas internas não vão ao provedor:
 * gravam direto na tabela com `is_internal_note`.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  const orgId = useOrgId();

  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      content: string;
      provider: Database["public"]["Enums"]["whatsapp_provider"];
      internalNote?: boolean;
    }) => {
      if (input.internalNote) {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase.from("whatsapp_messages").insert({
          conversation_id: input.conversationId,
          org_id: orgId!,
          direction: "outbound",
          content: input.content,
          is_internal_note: true,
          sent_by: auth.user?.id ?? null,
          type: "text",
          status: "sent",
        });
        if (error) throw error;
        return;
      }

      const fn = input.provider === "evolution" ? "evolution-send-message" : "meta-send-message";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { conversation_id: input.conversationId, content: input.content },
      });
      if (error) throw new Error(error.message ?? "Falha ao enviar a mensagem.");
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["messages", input.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations", orgId] });
    },
  });
}

interface StatusVars {
  id: string;
  status: ConversationStatus;
  assigned_to?: string | null;
  team_id?: string | null;
}

/** Atualiza status/atribuição da conversa (assumir, devolver, transferir, encerrar). */
export function useUpdateConversation() {
  const queryClient = useQueryClient();
  const orgId = useOrgId();

  return useMutation({
    mutationFn: async ({ id, ...patch }: StatusVars) => {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["conversations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
    },
  });
}

/** Zera o contador de não lidas ao abrir a conversa. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  const orgId = useOrgId();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("id", conversationId)
        .neq("unread_count", 0);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations", orgId] }),
  });
}

/** Aplica o conjunto de tags (strings livres) da conversa, guardado em `tags` (JSONB). */
export function useSetConversationTags() {
  const queryClient = useQueryClient();
  const orgId = useOrgId();

  return useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ tags, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["conversations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
    },
  });
}
