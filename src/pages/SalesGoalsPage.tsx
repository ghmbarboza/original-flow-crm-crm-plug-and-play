import { useState } from "react";
import { toast } from "sonner";
import { Plus, Target, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GOAL_SUBTYPES, GOAL_TYPES, useDeleteSalesGoal, useSalesGoals, useSaveSalesGoal,
  type GoalCriteria, type GoalSubtype, type GoalType, type GoalWithProgress, ASSIGN_INDIVIDUAL, ASSIGN_TEAM } from "@/hooks/useSalesGoals";
import { useOrgMembers, useOrgMemberNames } from "@/hooks/useOrgMembers";
import { formatCurrency } from "@/lib/format";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const NOW = new Date();
const ALL_MEMBER = "__team__";

function formatValue(type: string, value: number, subtype?: string | null) {
  if (type === "revenue") return formatCurrency(value);
  if (type === "deal_criteria") {
    const unit = GOAL_SUBTYPES.find((s) => s.value === subtype)?.unit;
    if (unit === "%") return `${Math.round(value)}%`;
    if (unit === "h") return `${value}h`;
  }
  return String(Math.round(value));
}

/** Rótulo do card para metas por critério: descreve a regra, não só o tipo. */
function criteriaLabel(goal: GoalWithProgress): string {
  const criteria = (goal.criteria ?? {}) as GoalCriteria;
  switch (goal.goal_subtype) {
    case "min_deal_value":
      return `Deals acima de ${formatCurrency(Number(criteria.min_value ?? 0))}`;
    case "conversion_rate":
      return "Taxa de conversão mínima";
    case "avg_response_time":
      return "TMA máximo (1ª resposta)";
    default:
      return "Critério de deal";
  }
}

export default function SalesGoalsPage() {
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());

  const { data: goals, isLoading, error } = useSalesGoals(month, year);
  const { data: members } = useOrgMembers();
  const memberNames = useOrgMemberNames();
  const saveGoal = useSaveSalesGoal();
  const deleteGoal = useDeleteSalesGoal();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    goal_type: "revenue" as GoalType,
    goal_subtype: "min_deal_value" as GoalSubtype,
    min_value: "",
    assignee: ALL_MEMBER,
    target_value: "",
  });

  const years = [NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1];

  const create = async () => {
    const target = Number(form.target_value);
    if (!target || target <= 0) {
      toast.error("Informe uma meta válida.");
      return;
    }
    const isCriteria = form.goal_type === "deal_criteria";
    if (isCriteria && form.goal_subtype === "min_deal_value" && !(Number(form.min_value) > 0)) {
      toast.error("Informe o valor mínimo do deal para este critério.");
      return;
    }
    try {
      await saveGoal.mutateAsync({
        goal_type: form.goal_type,
        goal_subtype: isCriteria ? form.goal_subtype : null,
        criteria:
          isCriteria && form.goal_subtype === "min_deal_value"
            ? { min_value: Number(form.min_value) }
            : {},
        assign_type: form.assignee === ALL_MEMBER ? ASSIGN_TEAM : ASSIGN_INDIVIDUAL,
        user_id: form.assignee === ALL_MEMBER ? null : form.assignee,
        team_id: null,
        target_value: target,
        period_month: month,
        period_year: year,
      });
      toast.success("Meta criada.");
      setForm({ goal_type: "revenue", goal_subtype: "min_deal_value", min_value: "", assignee: ALL_MEMBER, target_value: "" });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a meta.");
    }
  };

  const remove = async (goal: GoalWithProgress) => {
    try {
      await deleteGoal.mutateAsync(goal.id);
      toast.success("Meta excluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Target className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
              Metas
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-28" aria-label="Mês da meta"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28" aria-label="Ano da meta"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => setOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Nova meta
            </Button>
          </div>
        </div>

        {error && <ErrorState title="Não foi possível carregar as metas" error={error} />}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (goals ?? []).length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nenhuma meta neste período"
            description="Defina metas de receita, negócios, atividades ou contatos por pessoa ou para o time."
            action={<Button onClick={() => setOpen(true)}>Criar primeira meta</Button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(goals ?? []).map((goal) => {
              const isCriteria = goal.goal_type === "deal_criteria";
              const lowerIsBetter = isCriteria
                && GOAL_SUBTYPES.find((s) => s.value === goal.goal_subtype)?.lowerIsBetter === true;
              const typeLabel = isCriteria
                ? criteriaLabel(goal)
                : GOAL_TYPES.find((t) => t.value === goal.goal_type)?.label ?? goal.goal_type;
              // TMA inverte a leitura: abaixo da meta é bom, acima é estouro.
              const pct = lowerIsBetter
                ? goal.computed_current <= goal.target_value
                  ? 100
                  : Math.max(0, Math.round((goal.target_value / Math.max(goal.computed_current, 0.1)) * 100))
                : goal.target_value > 0
                  ? Math.min(100, (goal.computed_current / goal.target_value) * 100)
                  : 0;
              const atingiu = lowerIsBetter ? goal.computed_current <= goal.target_value : pct >= 100;
              const who = goal.assign_type === ASSIGN_INDIVIDUAL
                ? (goal.user_id ? memberNames.get(goal.user_id) ?? "Usuário" : "Usuário")
                : "Time";
              return (
                <div key={goal.id} className="via-card group p-4" data-testid="sales-goal-card">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium" style={{ color: "var(--via-text-primary)" }}>{typeLabel}</p>
                      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{who}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="opacity-0 transition-opacity group-hover:opacity-100" onClick={() => remove(goal)} aria-label="Excluir meta">
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                  <Progress value={pct} className="mb-2" />
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="tabular-nums" style={{ color: "var(--via-text-primary)" }}>
                      {lowerIsBetter ? (
                        <>Meta: até {formatValue(goal.goal_type, goal.target_value, goal.goal_subtype)} · Atual: {formatValue(goal.goal_type, goal.computed_current, goal.goal_subtype)}</>
                      ) : (
                        <>{formatValue(goal.goal_type, goal.computed_current, goal.goal_subtype)} / {formatValue(goal.goal_type, goal.target_value, goal.goal_subtype)}</>
                      )}
                    </span>
                    <span className="font-medium tabular-nums" style={{ color: atingiu ? "var(--via-success)" : "var(--via-text-muted)" }}>
                      {atingiu ? "✓" : lowerIsBetter ? "⚠ acima" : `${Math.round(pct)}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova meta · {MONTHS[month - 1]}/{year}</DialogTitle>
            <DialogDescription>
              A meta vale para o mês selecionado acima e pode ser do time inteiro ou de uma
              pessoa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Os Select do Radix renderizam um <button>, e <label for> não nomeia botão.
                A associação correta é o trigger apontar para o texto do rótulo com
                aria-labelledby — sem isso o leitor de tela anuncia só o valor atual. */}
            <div className="space-y-2">
              <Label id="goal-type-label">Tipo</Label>
              <Select value={form.goal_type} onValueChange={(v) => setForm({ ...form, goal_type: v as GoalType })}>
                <SelectTrigger aria-labelledby="goal-type-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.goal_type === "deal_criteria" && (
              <>
                <div className="space-y-2">
                  <Label id="goal-subtype-label">Critério</Label>
                  <Select value={form.goal_subtype} onValueChange={(v) => setForm({ ...form, goal_subtype: v as GoalSubtype })}>
                    <SelectTrigger aria-labelledby="goal-subtype-label" data-testid="goal-subtype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GOAL_SUBTYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.goal_subtype === "min_deal_value" && (
                  <div className="space-y-2">
                    <Label htmlFor="goal-min-value">Valor mínimo do deal (R$)</Label>
                    <Input
                      id="goal-min-value"
                      type="number"
                      min="0"
                      placeholder="10000"
                      value={form.min_value}
                      onChange={(e) => setForm({ ...form, min_value: e.target.value })}
                    />
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label id="goal-assignee-label">Responsável</Label>
              <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                <SelectTrigger aria-labelledby="goal-assignee-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MEMBER}>Time inteiro</SelectItem>
                  {(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target">
                Meta (
                {form.goal_type === "revenue"
                  ? "R$"
                  : form.goal_type === "deal_criteria"
                    ? GOAL_SUBTYPES.find((s) => s.value === form.goal_subtype)?.unit ?? "quantidade"
                    : "quantidade"}
                )
              </Label>
              <Input id="target" type="number" min="0" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} />
              {form.goal_type === "deal_criteria" && form.goal_subtype === "avg_response_time" && (
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Tempo médio máximo de primeira resposta, em horas. Ficar abaixo é bater a meta.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saveGoal.isPending}>Criar meta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
