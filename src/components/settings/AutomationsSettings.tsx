import { useState } from "react";
import { toast } from "sonner";
import { History, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { LinkBiblioteca } from "@/components/library/LinkBiblioteca";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AutomationBuilderDialog } from "@/components/automations/AutomationBuilderDialog";
import {
  TRIGGERS, useAutomationLogs, useAutomations, useDeleteAutomation, useToggleAutomation,
  type Automation,
} from "@/hooks/useAutomations";
import { formatDateTime } from "@/lib/format";

function triggerLabel(automation: Automation): string {
  const t = automation.trigger as { type?: string } | null;
  return TRIGGERS.find((x) => x.value === t?.type)?.label ?? "—";
}

function LogsSheet({ automation, onOpenChange }: { automation: Automation | null; onOpenChange: (o: boolean) => void }) {
  const { data: logs, isLoading } = useAutomationLogs(automation?.id ?? null);
  return (
    <Sheet open={!!automation} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {automation && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle>{automation.name}</SheetTitle>
              <SheetDescription>
                {automation.run_count} execução(ões), {automation.error_count} com erro.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-2 py-4">
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (logs ?? []).length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
                  Nenhuma execução registrada ainda.
                </p>
              ) : (
                (logs ?? []).map((log) => (
                  <div key={log.id} className="via-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={log.status === "success"
                          ? { background: "var(--via-success)", color: "var(--via-white)" }
                          : { background: "var(--via-coral-deep)", color: "var(--via-white)" }}
                      >
                        {log.status === "success" ? "Sucesso" : "Erro"}
                      </span>
                      <time className="text-xs" style={{ color: "var(--via-text-muted)" }}>{formatDateTime(log.ran_at)}</time>
                    </div>
                    {log.error_msg && <p className="mt-1 text-sm text-via-coral">{log.error_msg}</p>}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Configurações > Automações — reorganização final do sidebar (2026-07-31):
 * a página /automations virou esta aba, com a MESMA funcionalidade; a rota
 * antiga redireciona para cá.
 */
export default function AutomationsSettings() {
  const { data: automations, isLoading, error } = useAutomations();
  const toggle = useToggleAutomation();
  const deleteAutomation = useDeleteAutomation();

  const [editing, setEditing] = useState<Automation | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [logsFor, setLogsFor] = useState<Automation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (a: Automation) => { setEditing(a); setFormOpen(true); };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteAutomation.mutateAsync(pendingDelete.id);
      toast.success("Automação excluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* O h1 saiu com o AppShell — o título vem do cabeçalho da aba. */}
        <div className="flex justify-end">
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova automação
          </Button>
        </div>

        {error && <ErrorState title="Não foi possível carregar as automações" error={error} />}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (automations ?? []).length === 0 ? (
          <EmptyState
            icon={Zap}
            title="Nenhuma automação ainda"
            description="Comece do zero ou use um modelo pronto da Biblioteca."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={openCreate}>Criar automação</Button>
                <LinkBiblioteca categoria="automation" />
              </div>
            }
          />
        ) : (
          <div className="space-y-2">
            {(automations ?? []).map((automation) => (
              <div key={automation.id} className="via-card group flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium" style={{ color: "var(--via-text-primary)" }}>{automation.name}</p>
                  <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                    {triggerLabel(automation)} · {(automation.actions as unknown[] | null)?.length ?? 0} ação(ões) · {automation.run_count} execução(ões)
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={automation.is_active}
                    onCheckedChange={(v) => toggle.mutate({ id: automation.id, is_active: v })}
                    aria-label="Ativa"
                  />
                  <Button size="icon" variant="ghost" onClick={() => setLogsFor(automation)} aria-label="Histórico">
                    <History className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(automation)} aria-label="Editar">
                    <Pencil className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setPendingDelete(automation)} aria-label="Excluir">
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AutomationBuilderDialog open={formOpen} onOpenChange={setFormOpen} automation={editing} />
      <LogsSheet automation={logsFor} onOpenChange={(o) => !o && setLogsFor(null)} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta automação?</AlertDialogTitle>
            <AlertDialogDescription>
              A automação e seu histórico de execuções são removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
