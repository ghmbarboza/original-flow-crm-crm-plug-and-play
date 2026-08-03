import { useState } from "react";
import { toast } from "sonner";
import { GitBranch, Plus, Trash2, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { LinkBiblioteca } from "@/components/library/LinkBiblioteca";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SequenceSheet } from "@/components/email/SequenceSheet";
import {
  useDeleteSequence, useEmailSequences, useSaveSequence, type SequenceWithCounts,
} from "@/hooks/useEmailSequences";

/**
 * Configurações > Automações > Cadências — reorganização final do sidebar (2026-07-31):
 * a página /email-sequences virou esta aba, com a MESMA funcionalidade; a
 * rota antiga redireciona para cá.
 */
export default function SequencesSettings() {
  const { data: sequences, isLoading, error } = useEmailSequences();
  const saveSequence = useSaveSequence();
  const deleteSequence = useDeleteSequence();

  const [selected, setSelected] = useState<SequenceWithCounts | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SequenceWithCounts | null>(null);

  const create = async () => {
    if (!newName.trim()) {
      toast.error("Informe o nome da sequência.");
      return;
    }
    try {
      await saveSequence.mutateAsync({ name: newName.trim() });
      toast.success("Sequência criada.");
      setNewName("");
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar.");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteSequence.mutateAsync(pendingDelete.id);
      toast.success("Sequência excluída.");
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
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova sequência
          </Button>
        </div>

        {error && <ErrorState title="Não foi possível carregar as sequências" error={error} />}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (sequences ?? []).length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="Nenhuma sequência ainda"
            description="Comece do zero ou use um modelo pronto da Biblioteca."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setCreateOpen(true)}>Criar sequência</Button>
                <LinkBiblioteca categoria="email_sequence" />
              </div>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(sequences ?? []).map((seq) => (
              <div key={seq.id} className="via-card group flex flex-col p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(seq)}>
                    <p className="truncate font-medium" style={{ color: "var(--via-text-primary)" }}>{seq.name}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={seq.is_active}
                      onCheckedChange={(v) => saveSequence.mutate({ id: seq.id, name: seq.name, is_active: v })}
                      aria-label="Ativa"
                    />
                    <Button size="icon" variant="ghost" className="opacity-0 transition-opacity group-hover:opacity-100" onClick={() => setPendingDelete(seq)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
                <button type="button" className="text-left" onClick={() => setSelected(seq)}>
                  <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                    {seq.stepCount} etapa(s)
                  </p>
                  <p className="flex items-center gap-1 text-sm" style={{ color: "var(--via-text-muted)" }}>
                    <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                    {seq.enrolledCount} inscrito(s)
                  </p>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SequenceSheet sequence={selected} onOpenChange={(open) => !open && setSelected(null)} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova sequência</DialogTitle>
            <DialogDescription>
              Dê um nome à sequência. As etapas de email são adicionadas depois, e nada é
              enviado enquanto você não ativá-la.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Nome da sequência"
            placeholder="Ex.: Onboarding de novos leads"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saveSequence.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta sequência?</AlertDialogTitle>
            <AlertDialogDescription>
              A sequência, suas etapas e as inscrições dos contatos são removidas permanentemente.
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
