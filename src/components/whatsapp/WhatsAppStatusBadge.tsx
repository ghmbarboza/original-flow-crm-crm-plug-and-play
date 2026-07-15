import { VIA_CONVERSATION_STATUS } from "@/lib/via-colors";
import type { ConversationStatus } from "@/hooks/useConversations";

/** Badge de status da conversa (IA ativa / atendimento humano / encerrada). */
export function WhatsAppStatusBadge({ status }: { status: ConversationStatus }) {
  const { bg, text, label } = VIA_CONVERSATION_STATUS[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: bg, color: text }}
    >
      {label}
    </span>
  );
}
