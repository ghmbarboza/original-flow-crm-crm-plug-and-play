import { useState } from "react";
import { toast } from "sonner";
import { CheckSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ActivityTypeBadge } from "@/components/activities/ActivityTypeBadge";
import {
  useDeleteActivity, useToggleActivityComplete, type Activity,
} from "@/hooks/useActivities";
import { formatDate } from "@/lib/format";

function linkLabel(activity: Activity): { text: string; to: string | null } {
  if (activity.deal) return { text: activity.deal.title, to: `/deals/${activity.deal.id}` };
  if (activity.contact) {
    const name = [activity.contact.first_name, activity.contact.last_name].filter(Boolean).join(" ").trim();
    return { text: name || "(contato)", to: "/contacts" };
  }
  if (activity.company) return { text: activity.company.name, to: "/companies" };
  return { text: "—", to: null };
}

interface Props {
  activities: Activity[];
  isLoading: boolean;
  isFiltered: boolean;
  /** Esconde a coluna Tipo (na página de Tarefas todas são do tipo task). */
  hideType?: boolean;
  emptyLabel: string;
  onEdit: (activity: Activity) => void;
  onCreate: () => void;
}

export function ActivitiesTable({
  activities, isLoading, isFiltered, hideType, emptyLabel, onEdit, onCreate,
}: Props) {
  const navigate = useNavigate();
  const toggleComplete = useToggleActivityComplete();
  const deleteActivity = useDeleteActivity();
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);

  const handleToggle = async (activity: Activity) => {
    try {
      await toggleComplete.mutateAsync({
        id: activity.id,
        completed: !activity.completed_at,
        deal_id: activity.deal_id,
        contact_id: activity.contact_id,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível atualizar: ${error.message}` : "Não foi possível atualizar.",
      );
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteActivity.mutateAsync({
        id: pendingDelete.id,
        deal_id: pendingDelete.deal_id,
        contact_id: pendingDelete.contact_id,
      });
      toast.success("Excluído.");
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível excluir: ${error.message}` : "Não foi possível excluir.",
      );
    } finally {
      setPendingDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="via-card p-10 text-center">
        <CheckSquare className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        {isFiltered ? (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nada corresponde ao filtro
            </p>
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Ajuste os filtros para ver outros registros.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              {emptyLabel}
            </p>
            <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
              Registros ajudam a acompanhar o relacionamento com contatos e negócios.
            </p>
            <Button onClick={onCreate}>Criar o primeiro</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="via-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              {!hideType && <TableHead>Tipo</TableHead>}
              <TableHead>Título</TableHead>
              <TableHead>Vínculo</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((activity) => {
              const done = !!activity.completed_at;
              const link = linkLabel(activity);
              return (
                <TableRow key={activity.id}>
                  <TableCell>
                    <Checkbox
                      checked={done}
                      onCheckedChange={() => handleToggle(activity)}
                      aria-label={done ? "Marcar como pendente" : "Marcar como concluída"}
                    />
                  </TableCell>
                  {!hideType && (
                    <TableCell>
                      <ActivityTypeBadge type={activity.type} />
                    </TableCell>
                  )}
                  <TableCell
                    className="font-medium"
                    style={{
                      color: done ? "var(--via-text-muted)" : "var(--via-text-primary)",
                      textDecoration: done ? "line-through" : "none",
                    }}
                  >
                    {activity.title}
                  </TableCell>
                  <TableCell>
                    {link.to ? (
                      <button
                        type="button"
                        className="truncate text-left hover:underline"
                        onClick={() => navigate(link.to!)}
                      >
                        {link.text}
                      </button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell style={{ color: "var(--via-text-muted)" }}>
                    {formatDate(activity.due_date)}
                  </TableCell>
                  <TableCell>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={
                        done
                          ? { background: "var(--via-success)", color: "var(--via-white)" }
                          : { background: "var(--via-surface)", color: "var(--via-text-body)" }
                      }
                    >
                      {done ? "Concluída" : "Pendente"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações para ${activity.title}`}>
                          <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(activity)}>
                          <Pencil className="mr-2 h-4 w-4" strokeWidth={1.5} />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPendingDelete(activity)}>
                          <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              A ação é permanente. O vínculo com contato e negócio é desfeito, mas eles não são apagados.
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
