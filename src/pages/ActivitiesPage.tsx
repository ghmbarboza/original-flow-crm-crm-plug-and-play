import { useMemo, useState } from "react";
import { Activity as ActivityIcon, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { ActivitiesTable } from "@/components/activities/ActivitiesTable";
import { ActivityFormDialog } from "@/components/activities/ActivityFormDialog";
import {
  ACTIVITY_TYPE_LABEL, useActivities, type Activity, type ActivityType,
} from "@/hooks/useActivities";

const ALL = "__all__";
const TYPES = Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[];

export default function ActivitiesPage() {
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const { data: activities, isLoading, error } = useActivities({
    type: typeFilter === ALL ? undefined : (typeFilter as ActivityType),
    status: statusFilter === ALL ? undefined : (statusFilter as "open" | "done"),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

  const isFiltered = typeFilter !== ALL || statusFilter !== ALL;

  // A query já filtra no servidor; o memo mantém referência estável para a tabela.
  const rows = useMemo(() => activities ?? [], [activities]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (activity: Activity) => {
    setEditing(activity);
    setFormOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ActivityIcon className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Atividades
            </h1>
          </div>
          <Button onClick={openCreate} className="gap-1.5" data-testid="activity-new">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova atividade
          </Button>
        </div>

        {error && (
          <ErrorState
            title="Não foi possível carregar as atividades"
            message={
              <>
                {error instanceof Error ? error.message : "Erro desconhecido."} Recarregue a página.
              </>
            }
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {TYPES.map((type) => (
                <SelectItem key={type} value={type}>{ACTIVITY_TYPE_LABEL[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>

        <ActivitiesTable
          activities={rows}
          isLoading={isLoading}
          isFiltered={isFiltered}
          emptyLabel="Nenhuma atividade ainda"
          onEdit={openEdit}
          onCreate={openCreate}
        />
      </div>

      <ActivityFormDialog open={formOpen} onOpenChange={setFormOpen} activity={editing} />
    </AppShell>
  );
}
