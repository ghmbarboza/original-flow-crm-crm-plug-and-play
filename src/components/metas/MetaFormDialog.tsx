import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SeletorPeriodo } from "@/components/metas/SeletorPeriodo";
import {
  ASSIGN_INDIVIDUAL, ASSIGN_TEAM, useOrigensDeLead, useSaveSalesGoal, type MetaComProgresso,
} from "@/hooks/useSalesGoals";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import { usePipelines } from "@/hooks/usePipelines";
import {
  METRICAS, TIPOS_ATIVIDADE, definicaoDaMetrica, type FiltrosMeta, type Metrica, type Periodo, type TipoPeriodo,
} from "@/lib/metas";

const TIME = "__time__";
const TODOS = "__todos__";
const GRUPOS = ["Vendas", "Leads e atividades", "Conversão", "Atendimento"] as const;
const TIPOS_PADRAO = ["call", "meeting", "email", "task"];

// Quais filtros fazem sentido para cada métrica.
const USA_FUNIL: Metrica[] = ["revenue", "deals", "deals_created", "avg_ticket", "min_deal_value", "conversion_rate", "lead_to_deal"];
const USA_ORIGEM: Metrica[] = [...USA_FUNIL, "contacts"];

const UNIDADE_DO_ALVO = { moeda: "R$", quantidade: "quantidade", percentual: "%", horas: "horas" } as const;

interface Props {
  /** Meta em edição; null cria uma nova. */
  meta: MetaComProgresso | null;
  /** Período sugerido para meta nova (o que está aberto na tela). */
  periodoInicial: Periodo;
  onClose: () => void;
}

/** Cria ou edita uma meta. Montado só enquanto aberto: cada abertura parte da meta. */
export function MetaFormDialog({ meta, periodoInicial, onClose }: Props) {
  const salvar = useSaveSalesGoal();
  const { data: membros } = useOrgMembers();
  const { data: funis } = usePipelines();
  const { data: origens } = useOrigensDeLead();

  const filtrosIniciais = meta?.filtros ?? {};
  const [nome, setNome] = useState(meta?.name ?? "");
  const [metrica, setMetrica] = useState<Metrica>((meta?.goal_type as Metrica) ?? "revenue");
  const [responsavel, setResponsavel] = useState(
    meta?.assign_type === ASSIGN_INDIVIDUAL && meta.user_id ? meta.user_id : TIME,
  );
  const [periodo, setPeriodo] = useState<Periodo>(
    meta ? { tipo: meta.period_kind as TipoPeriodo, inicio: meta.period_start, fim: meta.period_end } : periodoInicial,
  );
  const [alvo, setAlvo] = useState(meta ? String(meta.target_value) : "");
  const [funil, setFunil] = useState(filtrosIniciais.pipeline_id ?? TODOS);
  const [origem, setOrigem] = useState(filtrosIniciais.origem ?? TODOS);
  const [valorMinimo, setValorMinimo] = useState(filtrosIniciais.valor_minimo ? String(filtrosIniciais.valor_minimo) : "");
  const [tiposAtividade, setTiposAtividade] = useState<string[]>(filtrosIniciais.tipos_atividade ?? TIPOS_PADRAO);

  const definicao = definicaoDaMetrica(metrica)!;
  const alternarTipo = (tipo: string, marcado: boolean) =>
    setTiposAtividade((atual) => (marcado ? [...atual, tipo] : atual.filter((t) => t !== tipo)));

  const handleSalvar = async () => {
    const valorAlvo = Number(alvo.replace(",", "."));
    if (!Number.isFinite(valorAlvo) || valorAlvo <= 0) return toast.error("Informe o valor da meta.");
    if (definicao.unidade === "percentual" && valorAlvo > 100) return toast.error("Uma taxa vai de 0 a 100%.");
    if (periodo.fim < periodo.inicio) return toast.error("O fim do período vem antes do início.");
    if (metrica === "min_deal_value" && !(Number(valorMinimo) > 0)) return toast.error("Informe o valor mínimo do negócio.");
    if (metrica === "activities" && tiposAtividade.length === 0) return toast.error("Escolha ao menos um tipo de atividade.");

    const filtros: FiltrosMeta = {
      ...(USA_FUNIL.includes(metrica) && funil !== TODOS ? { pipeline_id: funil } : {}),
      ...(USA_ORIGEM.includes(metrica) && origem !== TODOS ? { origem } : {}),
      ...(metrica === "min_deal_value" ? { valor_minimo: Number(valorMinimo) } : {}),
      ...(metrica === "activities" ? { tipos_atividade: tiposAtividade } : {}),
    };
    try {
      await salvar.mutateAsync({
        id: meta?.id,
        name: nome,
        goal_type: metrica,
        assign_type: responsavel === TIME ? ASSIGN_TEAM : ASSIGN_INDIVIDUAL,
        user_id: responsavel === TIME ? null : responsavel,
        target_value: valorAlvo,
        period_kind: periodo.tipo,
        period_start: periodo.inicio,
        period_end: periodo.fim,
        filters: filtros,
      });
      toast.success(meta ? "Meta atualizada." : "Meta criada.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a meta.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-testid="meta-dialog">
        <DialogHeader>
          <DialogTitle>{meta ? "Editar meta" : "Nova meta"}</DialogTitle>
          <DialogDescription>O realizado é calculado sozinho, com os dados do período da meta.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="meta-nome">Nome (opcional)</Label>
            <Input id="meta-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Receita do time comercial" data-testid="meta-nome" />
          </div>

          {/* Select do Radix renderiza <button>: o rótulo liga por aria-labelledby. */}
          <div className="space-y-2">
            <Label id="meta-metrica-label">O que medir</Label>
            <Select value={metrica} onValueChange={(v) => setMetrica(v as Metrica)}>
              <SelectTrigger aria-labelledby="meta-metrica-label" data-testid="meta-metrica"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRUPOS.map((grupo) => (
                  <SelectGroup key={grupo}>
                    <SelectLabel>{grupo}</SelectLabel>
                    {METRICAS.filter((m) => m.grupo === grupo).map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{definicao.descricao}</p>
          </div>

          {metrica === "min_deal_value" && (
            <div className="space-y-2">
              <Label htmlFor="meta-valor-minimo">Valor mínimo do negócio (R$)</Label>
              <Input id="meta-valor-minimo" type="number" min="0" value={valorMinimo} onChange={(e) => setValorMinimo(e.target.value)} />
            </div>
          )}

          {metrica === "activities" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Tipos de atividade que contam</legend>
              <div className="flex flex-wrap gap-4">
                {TIPOS_ATIVIDADE.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={tiposAtividade.includes(t.value)} onCheckedChange={(v) => alternarTipo(t.value, v === true)} />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="space-y-2">
            <Label id="meta-responsavel-label">Responsável</Label>
            <Select value={responsavel} onValueChange={setResponsavel}>
              <SelectTrigger aria-labelledby="meta-responsavel-label" data-testid="meta-responsavel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TIME}>Time inteiro</SelectItem>
                {(membros ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Período</Label>
            <SeletorPeriodo valor={periodo} onChange={setPeriodo} testIdPrefix="meta-periodo" />
          </div>

          {USA_FUNIL.includes(metrica) && (funis?.length ?? 0) > 1 && (
            <div className="space-y-2">
              <Label id="meta-funil-label">Funil</Label>
              <Select value={funil} onValueChange={setFunil}>
                <SelectTrigger aria-labelledby="meta-funil-label" data-testid="meta-funil"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos os funis</SelectItem>
                  {(funis ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {USA_ORIGEM.includes(metrica) && (origens?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <Label id="meta-origem-label">Origem do lead</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger aria-labelledby="meta-origem-label" data-testid="meta-origem"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas as origens</SelectItem>
                  {(origens ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="meta-alvo">
              {definicao.menorEMelhor ? "Máximo aceitável" : "Meta"} ({UNIDADE_DO_ALVO[definicao.unidade]})
            </Label>
            <Input id="meta-alvo" type="number" min="0" step="any" className="w-48" value={alvo} onChange={(e) => setAlvo(e.target.value)} data-testid="meta-alvo" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvar.isPending} data-testid="meta-salvar">
            {meta ? "Salvar" : "Criar meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
