import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MetaFormDialog } from "@/components/metas/MetaFormDialog";
import { SeletorPeriodo } from "@/components/metas/SeletorPeriodo";
import {
  ASSIGN_INDIVIDUAL, ASSIGN_TEAM, useDeleteSalesGoal, useSalesGoals, type MetaComProgresso,
} from "@/hooks/useSalesGoals";
import { useOrgMemberNames, useOrgMembers } from "@/hooks/useOrgMembers";
import { usePipelines } from "@/hooks/usePipelines";
import { formatCurrency } from "@/lib/format";
import {
  TIPOS_ATIVIDADE, definicaoDaMetrica, periodoQueContem, rotuloPeriodo, type Periodo, type TipoPeriodo, type Unidade,
} from "@/lib/metas";

const TODOS = "__todos__";
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function formatarValor(unidade: Unidade, valor: number): string {
  if (unidade === "moeda") return formatCurrency(valor);
  if (unidade === "percentual") return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (unidade === "horas") return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
  return String(Math.round(valor));
}

/**
 * Metas: cada uma com período próprio (semana, mês, trimestre, semestre, ano ou
 * datas livres), responsável, filtros e alvo. A tela mostra as metas que têm
 * algum dia dentro do período escolhido no topo.
 */
export default function SalesGoalsPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoQueContem("mes", hoje()));
  const [filtroResponsavel, setFiltroResponsavel] = useState(TODOS);
  const [formulario, setFormulario] = useState<MetaComProgresso | "nova" | null>(null);
  const [excluindo, setExcluindo] = useState<MetaComProgresso | null>(null);

  const { data: metas, isLoading, error } = useSalesGoals(periodo);
  const { data: membros } = useOrgMembers();
  const nomes = useOrgMemberNames();
  const { data: funis } = usePipelines();
  const excluir = useDeleteSalesGoal();

  const visiveis = (metas ?? []).filter((m) => {
    if (filtroResponsavel === TODOS) return true;
    if (filtroResponsavel === ASSIGN_TEAM) return m.assign_type === ASSIGN_TEAM;
    return m.assign_type === ASSIGN_INDIVIDUAL && m.user_id === filtroResponsavel;
  });

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    try {
      await excluir.mutateAsync(excluindo.id);
      toast.success("Meta excluída.");
      setExcluindo(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
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
          <Button onClick={() => setFormulario("nova")} className="gap-1.5" data-testid="meta-nova">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova meta
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SeletorPeriodo valor={periodo} onChange={setPeriodo} tipos={["mes", "trimestre", "semestre", "ano", "personalizado"]} testIdPrefix="metas-periodo" />
          <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
            <SelectTrigger className="w-48" aria-label="Filtrar por responsável" data-testid="metas-responsavel"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
              <SelectItem value={ASSIGN_TEAM}>Só metas do time</SelectItem>
              {(membros ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {error && <ErrorState title="Não foi possível carregar as metas" error={error} />}

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : visiveis.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nenhuma meta neste período"
            description="Defina metas de receita, negócios, ticket médio, leads, atividades, taxas de conversão ou tempo de resposta, por pessoa ou para o time."
            action={<Button onClick={() => setFormulario("nova")}>Criar meta</Button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visiveis.map((meta) => (
              <CartaoMeta
                key={meta.id}
                meta={meta}
                responsavel={meta.assign_type === ASSIGN_INDIVIDUAL ? nomes.get(meta.user_id ?? "") ?? "Usuário" : "Time inteiro"}
                nomeDoFunil={(id) => funis?.find((f) => f.id === id)?.name}
                onEditar={() => setFormulario(meta)}
                onExcluir={() => setExcluindo(meta)}
              />
            ))}
          </div>
        )}
      </div>

      {formulario && (
        <MetaFormDialog
          meta={formulario === "nova" ? null : formulario}
          periodoInicial={periodo.tipo === "personalizado" ? periodo : periodoQueContem(periodo.tipo, periodo.inicio)}
          onClose={() => setFormulario(null)}
        />
      )}

      <AlertDialog open={!!excluindo} onOpenChange={(open) => !open && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a meta?</AlertDialogTitle>
            <AlertDialogDescription>
              A meta sai da lista. Os negócios, contatos e atividades usados no cálculo continuam como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmarExclusao(); }} disabled={excluir.isPending} data-testid="meta-excluir-confirmar">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

interface CartaoProps {
  meta: MetaComProgresso;
  responsavel: string;
  nomeDoFunil: (id: string) => string | undefined;
  onEditar: () => void;
  onExcluir: () => void;
}

function CartaoMeta({ meta, responsavel, nomeDoFunil, onEditar, onExcluir }: CartaoProps) {
  const definicao = definicaoDaMetrica(meta.goal_type);
  const unidade = definicao?.unidade ?? "quantidade";
  const titulo = meta.name?.trim() || definicao?.label || meta.goal_type;
  const { filtros, progresso: p } = meta;
  const periodo = rotuloPeriodo({ tipo: meta.period_kind as TipoPeriodo, inicio: meta.period_start, fim: meta.period_end });

  const etiquetas = [
    meta.name?.trim() && definicao ? definicao.label : null,
    filtros.pipeline_id ? `Funil ${nomeDoFunil(filtros.pipeline_id) ?? "removido"}` : null,
    filtros.origem ? `Origem ${filtros.origem}` : null,
    filtros.valor_minimo ? `Acima de ${formatCurrency(filtros.valor_minimo)}` : null,
    filtros.tipos_atividade?.length
      ? TIPOS_ATIVIDADE.filter((t) => filtros.tipos_atividade!.includes(t.value)).map((t) => t.label).join(", ")
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="via-card space-y-3 p-4" data-testid="sales-goal-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-medium" style={{ color: "var(--via-text-primary)" }}>{titulo}</p>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{responsavel} · {periodo}</p>
          {etiquetas.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {etiquetas.map((e) => <Badge key={e} variant="secondary" className="font-normal">{e}</Badge>)}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onEditar} aria-label={`Editar a meta ${titulo}`} data-testid="meta-editar">
            <Pencil className="h-4 w-4" strokeWidth={1.5} />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onExcluir} aria-label={`Excluir a meta ${titulo}`} data-testid="meta-excluir">
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
      <Progress value={p.percentual} />
      <div className="flex items-baseline justify-between text-sm">
        <span className="tabular-nums" style={{ color: "var(--via-text-primary)" }} data-testid="meta-valores">
          {meta.realizado === null
            ? <>Sem dados no período · meta {formatarValor(unidade, Number(meta.target_value))}</>
            : definicao?.menorEMelhor
              ? <>Atual {formatarValor(unidade, meta.realizado)} · máximo {formatarValor(unidade, Number(meta.target_value))}</>
              : <>{formatarValor(unidade, meta.realizado)} de {formatarValor(unidade, Number(meta.target_value))}</>}
        </span>
        <span className="font-medium tabular-nums" style={{ color: p.atingiu ? "var(--via-success)" : "var(--via-text-muted)" }}>
          {p.semDados ? "-" : p.atingiu ? "Meta batida" : `${p.percentual}%`}
        </span>
      </div>
    </div>
  );
}
