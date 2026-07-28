import { useMemo, useState } from "react";
import { CheckSquare, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { ActivitiesTable } from "@/components/activities/ActivitiesTable";
import { ActivityFormDialog } from "@/components/activities/ActivityFormDialog";
import { useActivities, type Activity } from "@/hooks/useActivities";

const ALL = "__all__";

type SortKey = "due_asc" | "due_desc" | "created_desc";

/** Empurra tarefas sem prazo para o fim, independente da direção. */
function compareByDue(a: Activity, b: Activity, dir: 1 | -1) {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return (new Date(a.due_date).getTime() - new Date(b.due_date).getTime()) * dir;
}

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [sort, setSort] = useState<SortKey>("due_asc");

  const { data: tasks, isLoading, error } = useActivities({
    type: "task",
    status: statusFilter === ALL ? undefined : (statusFilter as "open" | "done"),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

  const sorted = useMemo(() => {
    const list = [...(tasks ?? [])];
    if (sort === "created_desc") return list; // já vem por created_at desc
    return list.sort((a, b) => compareByDue(a, b, sort === "due_asc" ? 1 : -1));
  }, [tasks, sort]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (task: Activity) => {
    setEditing(task);
    setFormOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Tarefas
            </h1>
          </div>
          <Button onClick={openCreate} className="gap-1.5" data-testid="task-new">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova tarefa
          </Button>
        </div>

        {error && (
          <ErrorState
            title="Não foi possível carregar as tarefas"
            message={
              <>
                {error instanceof Error ? error.message : "Erro desconhecido."} Recarregue a página.
              </>
            }
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os status</SelectItem>
              <SelectItem value="open">Pendentes</SelectItem>
              <SelectItem value="done">Concluídas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_asc">Prazo mais próximo</SelectItem>
              <SelectItem value="due_desc">Prazo mais distante</SelectItem>
              <SelectItem value="created_desc">Criadas recentemente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ActivitiesTable
          activities={sorted}
          isLoading={isLoading}
          isFiltered={statusFilter !== ALL}
          hideType
          emptyLabel="Nenhuma tarefa ainda"
          onEdit={openEdit}
          onCreate={openCreate}
        />
      </div>

      <ActivityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        activity={editing}
        lockedType="task"
      />
    </AppShell>
  );
}
