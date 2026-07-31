import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";
import type { ImportedConversation } from "@/lib/conversation-import";

export type ConversationImport = Database["public"]["Tables"]["conversation_imports"]["Row"];

/** Importações passadas, para a lista da tela. */
export function useConversationImports() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["conversation-imports", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ConversationImport[]> => {
      const { data, error } = await supabase
        .from("conversation_imports")
        .select("*")
        .eq("org_id", orgId!)
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Insere em lotes para não estourar o limite de payload do PostgREST. */
async function insertInChunks<T>(table: "conversation_messages", rows: T[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + chunkSize) as never);
    if (error) throw error;
  }
}

/**
 * Grava uma importação de histórico (Parte 6 do Sprint 10B).
 *
 * Ordem: registro em conversation_imports (processing) → conversas (status
 * closed + import_id, para a IA nunca responder e os triggers de SLA/kanban
 * ignorarem) → mensagens em lotes → totais e completed. Falha no meio marca
 * o registro como failed com a mensagem — a tela mostra o que aconteceu.
 */
export function useRunConversationImport() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      sourcePlatform: string;
      fileName: string;
      conversations: ImportedConversation[];
      totalMessages: number;
    }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data: auth } = await supabase.auth.getUser();

      // Provider das conversas importadas: o que a org usa hoje (só rotula; a
      // conversa nasce encerrada e nunca dispara envio).
      const { data: messagingConfig } = await supabase
        .from("messaging_config")
        .select("provider")
        .eq("org_id", orgId)
        .maybeSingle();
      const provider = (messagingConfig?.provider ?? "evolution") as Database["public"]["Enums"]["messaging_provider"];

      const { data: importRow, error: importError } = await supabase
        .from("conversation_imports")
        .insert({
          org_id: orgId,
          source_platform: input.sourcePlatform,
          file_name: input.fileName,
          status: "processing",
          imported_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (importError) throw importError;

      try {
        const now = new Date().toISOString();
        const { data: createdConvs, error: convError } = await supabase
          .from("conversations")
          .insert(
            input.conversations.map((c) => ({
              org_id: orgId,
              phone_number: c.phone,
              channel_contact_name: c.name,
              provider,
              channel: "whatsapp",
              status: "closed" as const,
              import_id: importRow.id,
              imported_at: now,
              unread_count: 0,
              last_message_at: c.messages.at(-1)?.sent_at ?? null,
              last_message_preview: c.messages.at(-1)?.content.slice(0, 120) ?? null,
            })),
          )
          .select("id, phone_number");
        if (convError) throw convError;

        const idByPhone = new Map((createdConvs ?? []).map((c) => [c.phone_number, c.id]));
        const messages = input.conversations.flatMap((c) => {
          const conversationId = idByPhone.get(c.phone);
          if (!conversationId) return [];
          return c.messages.map((m) => ({
            conversation_id: conversationId,
            org_id: orgId,
            direction: m.direction,
            content: m.content,
            sent_at: m.sent_at,
            type: "text",
            status: "sent",
          }));
        });
        await insertInChunks("conversation_messages", messages);

        const { error: doneError } = await supabase
          .from("conversation_imports")
          .update({
            status: "completed",
            total_conversations: input.conversations.length,
            total_messages: messages.length,
            completed_at: new Date().toISOString(),
          })
          .eq("id", importRow.id);
        if (doneError) throw doneError;

        return { imported: input.conversations.length, messages: messages.length };
      } catch (err) {
        await supabase
          .from("conversation_imports")
          .update({
            status: "failed",
            error_msg: err instanceof Error ? err.message : "Erro inesperado",
            completed_at: new Date().toISOString(),
          })
          .eq("id", importRow.id);
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-imports", orgId] });
      queryClient.invalidateQueries({ queryKey: ["conversations", orgId] });
    },
  });
}
