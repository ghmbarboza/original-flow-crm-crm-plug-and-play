import { useState } from "react";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TemplateFormDialog } from "@/components/email/TemplateFormDialog";
import {
  useDeleteEmailTemplate, useEmailTemplates, type EmailTemplate,
} from "@/hooks/useEmailTemplates";
import { formatDate } from "@/lib/format";

export default function EmailTemplatesPage() {
  const { data: templates, isLoading, error } = useEmailTemplates();
  const deleteTemplate = useDeleteEmailTemplate();

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EmailTemplate | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (template: EmailTemplate) => {
    setEditing(template);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTemplate.mutateAsync(pendingDelete.id);
      toast.success("Template excluído.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
              Templates de email
            </h1>
          </div>
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Novo template
          </Button>
        </div>

        {error && <ErrorState title="Não foi possível carregar os templates" error={error} />}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (templates ?? []).length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum template ainda"
            description="Crie templates reutilizáveis com variáveis para agilizar o envio de emails."
            action={<Button onClick={openCreate}>Criar primeiro template</Button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(templates ?? []).map((template) => (
              <div key={template.id} className="via-card group flex flex-col p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium" style={{ color: "var(--via-text-primary)" }}>{template.name}</p>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(template)} aria-label="Editar">
                      <Pencil className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setPendingDelete(template)} aria-label="Excluir">
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
                <p className="mb-2 line-clamp-1 text-sm" style={{ color: "var(--via-text-body)" }}>{template.subject}</p>
                <p className="mt-auto text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Atualizado {formatDate(template.updated_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <TemplateFormDialog open={formOpen} onOpenChange={setFormOpen} template={editing} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este template?</AlertDialogTitle>
            <AlertDialogDescription>
              O template sai da lista permanentemente. Sequências que o utilizam ficam sem o template
              vinculado nessa etapa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
