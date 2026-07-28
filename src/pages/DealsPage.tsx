import { useMemo, useState } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { DealsKanban } from "@/components/deals/DealsKanban";
import { DealsList } from "@/components/deals/DealsList";
import { DealFormDialog } from "@/components/deals/DealFormDialog";
import { DealPreviewDrawer } from "@/components/deals/DealPreviewDrawer";
import { useDeals, useStages, type Deal } from "@/hooks/useDeals";
import { useOrgMembers } from "@/hooks/useOrgMembers";

const ALL = "__all__";

export default function DealsPage() {
  const { data: deals, isLoading, error } = useDeals();
  const { data: stages } = useStages();
  const { data: members } = useOrgMembers();

  const [selected, setSelected] = useState<Deal | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [createStageId, setCreateStageId] = useState<string | null>(null);

  // Filtros da vista de lista.
  const [stageFilter, setStageFilter] = useState<string>(ALL);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const filtered = useMemo(() => {
    return (deals ?? []).filter((deal) => {
      if (stageFilter !== ALL && deal.stage_id !== stageFilter) return false;
      if (ownerFilter !== ALL && deal.owner_id !== ownerFilter) return false;
      if (statusFilter !== ALL && deal.status !== statusFilter) return false;
      return true;
    });
  }, [deals, stageFilter, ownerFilter, statusFilter]);

  const isFiltered = stageFilter !== ALL || ownerFilter !== ALL || statusFilter !== ALL;

  const openCreate = (stageId?: string) => {
    setEditing(null);
    setCreateStageId(stageId ?? null);
    setFormOpen(true);
  };

  const openEdit = (deal: Deal) => {
    setEditing(deal);
    setCreateStageId(null);
    setFormOpen(true);
    setSelected(null);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Negócios
            </h1>
          </div>
          <Button onClick={() => openCreate()} className="gap-1.5" data-testid="deal-new">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Novo negócio
          </Button>
        </div>

        {error && (
          <ErrorState
            title="Não foi possível carregar os negócios"
            message={
              <>
                {error instanceof Error ? error.message : "Erro desconhecido."} Recarregue a página; se
                persistir, avise um administrador.
              </>
            }
          />
        )}

        <Tabs defaultValue="kanban">
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="pt-4">
            <DealsKanban
              deals={deals ?? []}
              isLoading={isLoading}
              onSelect={setSelected}
              onCreate={openCreate}
            />
          </TabsContent>

          <TabsContent value="list" className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as etapas</SelectItem>
                  {(stages ?? []).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os owners</SelectItem>
                  {(members ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>{member.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os status</SelectItem>
                  <SelectItem value="open">Em aberto</SelectItem>
                  <SelectItem value="won">Ganho</SelectItem>
                  <SelectItem value="lost">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DealsList
              deals={filtered}
              isLoading={isLoading}
              isFiltered={isFiltered}
              onSelect={setSelected}
              onEdit={openEdit}
              onCreate={() => openCreate()}
            />
          </TabsContent>
        </Tabs>
      </div>

      <DealPreviewDrawer
        deal={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onEdit={openEdit}
      />
      <DealFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        deal={editing}
        defaultStageId={createStageId}
      />
    </AppShell>
  );
}
