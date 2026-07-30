import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Filter, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CONTACT_STATUS_LABEL, useContacts, type ContactStatus } from "@/hooks/useContacts";
import { useTags } from "@/hooks/useTags";
import {
  matchesCriteria, useContactGroups, useCreateGroup, useDeleteGroup,
  type ContactGroup, type GroupCriteria,
} from "@/hooks/useContactGroups";

const STATUSES = Object.keys(CONTACT_STATUS_LABEL) as ContactStatus[];
const ANY_STATUS = "__any__";

function NewGroupDialog() {
  const { data: tags } = useTags();
  const createGroup = useCreateGroup();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"fixed" | "dynamic">("dynamic");
  const [status, setStatus] = useState<string>(ANY_STATUS);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [minScore, setMinScore] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Dê um nome ao grupo.");
      return;
    }

    const criteria: GroupCriteria = {};
    if (type === "dynamic") {
      if (status !== ANY_STATUS) criteria.status = [status as ContactStatus];
      if (tagIds.length > 0) criteria.tagIds = tagIds;
      if (minScore.trim()) criteria.minScore = Number(minScore);
      if (inactiveDays.trim()) criteria.inactiveDays = Number(inactiveDays);

      if (Object.keys(criteria).length === 0) {
        toast.error("Um grupo dinâmico precisa de ao menos um critério.");
        return;
      }
    }

    try {
      await createGroup.mutateAsync({ name: name.trim(), type, criteria });
      toast.success("Grupo criado.");
      setOpen(false);
      setName("");
      setTagIds([]);
      setMinScore("");
      setInactiveDays("");
      setStatus(ANY_STATUS);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o grupo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Novo grupo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo grupo</DialogTitle>
          <DialogDescription>
            Grupo fixo tem membros escolhidos a dedo. Grupo dinâmico é uma regra: todo contato
            que atender aos critérios entra e sai sozinho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="group-name">Nome</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Clientes ativos, Leads frios…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-type">Tipo</Label>
            <Select value={type} onValueChange={(value) => setType(value as "fixed" | "dynamic")}>
              <SelectTrigger id="group-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dynamic">Dinâmico (por critérios)</SelectItem>
                <SelectItem value="fixed">Fixo (seleção manual)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "dynamic" && (
            <div className="space-y-4 rounded-md p-3" style={{ background: "var(--via-surface)" }}>
              <div className="space-y-2">
                <Label htmlFor="group-status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="group-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_STATUS}>Qualquer status</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{CONTACT_STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(tags ?? []).length > 0 && (
                <div className="space-y-2">
                  <Label>Tags (o contato precisa ter todas)</Label>
                  <div className="flex flex-wrap gap-2">
                    {(tags ?? []).map((tag) => (
                      <label key={tag.id} className="flex cursor-pointer items-center gap-1.5">
                        <Checkbox
                          checked={tagIds.includes(tag.id)}
                          onCheckedChange={(checked) =>
                            setTagIds(
                              checked === true
                                ? [...tagIds, tag.id]
                                : tagIds.filter((id) => id !== tag.id),
                            )
                          }
                        />
                        <span className="text-sm">{tag.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="group-score">Score mínimo</Label>
                  <Input
                    id="group-score"
                    type="number"
                    min={0}
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="group-inactive">Sem interação há (dias)</Label>
                  <Input
                    id="group-inactive"
                    type="number"
                    min={0}
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(e.target.value)}
                    placeholder="30"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={createGroup.isPending}>
            {createGroup.isPending ? "Criando…" : "Criar grupo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describeCriteria(criteria: GroupCriteria, tagNames: Map<string, string>): string {
  const parts: string[] = [];
  if (criteria.status?.length) {
    parts.push(`status ${criteria.status.map((s) => CONTACT_STATUS_LABEL[s]).join(" ou ")}`);
  }
  if (criteria.tagIds?.length) {
    parts.push(`tags ${criteria.tagIds.map((id) => tagNames.get(id) ?? "?").join(" + ")}`);
  }
  if (typeof criteria.minScore === "number") parts.push(`score ≥ ${criteria.minScore}`);
  if (typeof criteria.inactiveDays === "number") parts.push(`sem interação há ${criteria.inactiveDays} dias`);
  return parts.length > 0 ? parts.join(" · ") : "sem critérios";
}

export function GroupsPanel() {
  const { data: groups, isLoading } = useContactGroups();
  const { data: contacts } = useContacts();
  const { data: tags } = useTags();
  const deleteGroup = useDeleteGroup();
  const [pendingDelete, setPendingDelete] = useState<ContactGroup | null>(null);

  const tagNames = useMemo(
    () => new Map((tags ?? []).map((t) => [t.id, t.name])),
    [tags],
  );

  /** Grupo dinâmico não tem membros gravados: o tamanho é calculado agora, sobre os contatos. */
  const countFor = (group: ContactGroup) => {
    if (group.type !== "dynamic") return null;
    return (contacts ?? []).filter((c) => matchesCriteria(c, group.criteria)).length;
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteGroup.mutateAsync(pendingDelete.id);
      toast.success("Grupo excluído. Os contatos não foram afetados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o grupo.");
    } finally {
      setPendingDelete(null);
    }
  };

  const vazio = !isLoading && (groups ?? []).length === 0;

  return (
    <div className="max-w-3xl space-y-4">
      {/* Com a lista vazia, a ação única mora DENTRO do card (padrão de
          Atividades) — um botão sozinho no canto de uma tela vazia é fácil de
          não ver. Com grupos na lista, ele volta ao topo. */}
      {!vazio && (
        <div className="flex justify-end">
          <NewGroupDialog />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (groups ?? []).length === 0 ? (
        <div className="via-card p-8 text-center">
          <Users className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Nenhum grupo ainda
          </p>
          <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
            Grupos alimentam campanhas, distribuição de conversas e filtros de relatório.
            Um grupo dinâmico se mantém sozinho conforme os contatos mudam.
          </p>
          <div className="flex justify-center">
            <NewGroupDialog />
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {(groups ?? []).map((group) => {
            const count = countFor(group);
            return (
              <li key={group.id} className="via-card flex items-center gap-3 p-4">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "var(--via-surface)" }}
                >
                  {group.type === "dynamic" ? (
                    <Filter className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                  ) : (
                    <Users className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                    {group.name}
                  </p>
                  <p className="truncate text-xs" style={{ color: "var(--via-text-muted)" }}>
                    {group.type === "dynamic"
                      ? describeCriteria(group.criteria, tagNames)
                      : "Seleção manual"}
                  </p>
                </div>
                {count !== null && (
                  <span className="shrink-0 text-sm" style={{ color: "var(--via-text-body)" }}>
                    {count} contato(s)
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir grupo ${group.name}`}
                  onClick={() => setPendingDelete(group)}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o grupo "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O grupo deixa de existir. Os contatos que fazem parte dele não são apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
