import { useState } from "react";
import { toast } from "sonner";
import { Activity as ActivityIcon, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityTypeBadge } from "@/components/activities/ActivityTypeBadge";
import { ActivityFormDialog } from "@/components/activities/ActivityFormDialog";
import {
  useActivities, useDeleteActivity, useToggleActivityComplete, type Activity,
} from "@/hooks/useActivities";
import { formatDate } from "@/lib/format";

interface Props {
  dealId: string;
  contactId?: string | null;
}

export function DealActivitiesSection({ dealId, contactId }: Props) {
  const { data: activities, isLoading } = useActivities({ dealId });
  const toggleComplete = useToggleActivityComplete();
  const deleteActivity = useDeleteActivity();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

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
        error instanceof Error ? `Não foi possível atualizar: ${error.message}` : "Não foi possível atualizar a atividade.",
      );
    }
  };

  const handleDelete = async (activity: Activity) => {
    try {
      await deleteActivity.mutateAsync({ id: activity.id, deal_id: activity.deal_id, contact_id: activity.contact_id });
      toast.success("Atividade excluída.");
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível excluir: ${error.message}` : "Não foi possível excluir a atividade.",
      );
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="via-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ActivityIcon className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
            Atividades
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Nova
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (activities ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nenhuma atividade neste negócio. Registre ligações, reuniões, notas e tarefas para acompanhar o histórico.
        </p>
      ) : (
        <ul className="space-y-1">
          {(activities ?? []).map((activity) => {
            const done = !!activity.completed_at;
            return (
              <li
                key={activity.id}
                className="group flex items-start gap-3 rounded-md p-2 hover:bg-accent"
              >
                <Checkbox
                  checked={done}
                  onCheckedChange={() => handleToggle(activity)}
                  className="mt-0.5"
                  aria-label={done ? "Marcar como pendente" : "Marcar como concluída"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ActivityTypeBadge type={activity.type} iconOnly />
                    <p
                      className="truncate text-sm font-medium"
                      style={{
                        color: done ? "var(--via-text-muted)" : "var(--via-text-primary)",
                        textDecoration: done ? "line-through" : "none",
                      }}
                    >
                      {activity.title}
                    </p>
                  </div>
                  {activity.body && (
                    <p className="line-clamp-2 text-sm" style={{ color: "var(--via-text-body)" }}>
                      {activity.body}
                    </p>
                  )}
                  {activity.due_date && (
                    <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                      Prazo {formatDate(activity.due_date)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(activity)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Excluir ${activity.title}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ActivityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        activity={editing}
        presets={{ dealId, contactId: contactId ?? undefined }}
        hideLinks
      />
    </div>
  );
}
