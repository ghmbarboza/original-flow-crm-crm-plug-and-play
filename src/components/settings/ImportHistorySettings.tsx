import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportHistoryDialog } from "@/components/settings/ImportHistoryDialog";
import { useConversationImports } from "@/hooks/useConversationImport";
import { formatDateTime } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  pending: "pendente",
  processing: "processando",
  completed: "concluída",
  failed: "falhou",
};

/**
 * Importação de histórico de outras ferramentas de atendimento.
 *
 * Trazer conversas de plataformas externas é assunto de Integrações — este
 * conteúdo vivia em Configurações > Atendimento e foi movido sem mudanças de
 * comportamento (mesmo wizard, mesmos hooks).
 */
export default function ImportHistorySettings() {
  const { data: imports } = useConversationImports();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          Traga conversas do Chatwoot, Zendesk, Intercom ou de um CSV. Elas entram encerradas,
          visíveis na ficha do contato e no inbox — sem acionar IA nem automações.
        </p>
        <Button
          variant="outline"
          className="gap-1.5"
          onClick={() => setOpen(true)}
          data-testid="import-history-abrir"
        >
          <Upload className="h-4 w-4" strokeWidth={1.5} />
          Importar histórico
        </Button>
      </div>

      {(imports ?? []).length > 0 && (
        <ul className="space-y-1.5">
          {(imports ?? []).map((imp) => (
            <li
              key={imp.id}
              className="flex flex-wrap items-center gap-2 text-sm"
              style={{ color: "var(--via-text-body)" }}
            >
              <span className="font-medium">{imp.file_name ?? imp.source_platform}</span>
              <span style={{ color: "var(--via-text-muted)" }}>
                {STATUS_LABEL[imp.status] ?? imp.status}
                {imp.status === "completed"
                  ? ` · ${imp.total_conversations} conversas, ${imp.total_messages} mensagens`
                  : ""}
                {imp.error_msg ? ` · ${imp.error_msg}` : ""}
                {" · "}
                {formatDateTime(imp.started_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ImportHistoryDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}