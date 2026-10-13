import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, CalendarClock, GripVertical, ListChecks, MessageCircleReply, Pencil, Plus,
  Settings2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useStages, useUpdateStageConfig, type PipelineStage } from "@/hooks/useDeals";
import { useReorderStages } from "@/hooks/usePipelineStages";
import { moverEtapa } from "@/lib/etapasFunil";
import { StageDeleteDialog } from "@/components/settings/pipeline/StageDeleteDialog";
import { StageFormDialog } from "@/components/settings/pipeline/StageFormDialog";
import { FunilToolbar } from "@/components/settings/pipeline/FunilToolbar";
import { useFunilAtivo } from "@/hooks/usePipelines";

const QUALQUER_ANTERIOR = "__any__";
import {
  REQUIRED_FIELD_OPTIONS, parseRequiredFields, type RequiredFieldRule,
} from "@/lib/required-fields";

/**
 * Configurações > Automações > Funil — etapas e automações por etapa.
 *
 * As etapas nascem no setup e são editadas aqui: criar, renomear, trocar a
 * cor, reordenar (arrastando ou pelas setas) e excluir. "Configurar" define o
 * que acontece QUANDO um deal entra na etapa: mensagem automática (Parte 3 do
 * Sprint 10A), campos obrigatórios para entrar (Parte 5) e gatilho por
 * resposta (Parte 9).
 *
 * O agendamento em si é o trigger schedule_stage_message no banco — esta tela
 * só grava o template e o delay na etapa. A validação dos campos obrigatórios
 * roda no cliente ao mover o deal (Kanban e ficha do negócio).
 */
export default function PipelineSettings() {
  const { funis, funil, funilId, escolher } = useFunilAtivo();
  const { data: stages, isLoading } = useStages(funilId);
  const salvar = useUpdateStageConfig();
  const reordenar = useReorderStages();

  // Etapa aberta no formulário: uma etapa, "nova" ou nada.
  const [formulario, setFormulario] = useState<PipelineStage | "nova" | null>(null);
  const [excluindo, setExcluindo] = useState<PipelineStage | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  // Ordem escolhida enquanto o banco ainda não confirmou.
  const [ordemPendente, setOrdemPendente] = useState<string[] | null>(null);

  const [editando, setEditando] = useState<PipelineStage | null>(null);
  const [template, setTemplate] = useState("");
  const [delay, setDelay] = useState("0");
  const [obrigatorios, setObrigatorios] = useState<Set<string>>(new Set());
  const [moveOnReply, setMoveOnReply] = useState(false);
  const [moveFrom, setMoveFrom] = useState<string>(QUALQUER_ANTERIOR);

  const abrir = (s: PipelineStage) => {
    setEditando(s);
    setTemplate(s.auto_message_template ?? "");
    setDelay(String(s.auto_message_delay_hours ?? 0));
    setObrigatorios(new Set(parseRequiredFields(s.required_fields).map((r) => r.field)));
    setMoveOnReply(s.move_on_reply);
    setMoveFrom(s.move_on_reply_from_stage_id ?? QUALQUER_ANTERIOR);
  };

  const alternarCampo = (field: string, marcado: boolean) => {
    setObrigatorios((prev) => {
      const next = new Set(prev);
      if (marcado) next.add(field);
      else next.delete(field);
      return next;
    });
  };

  const submeter = async (removendo = false) => {
    if (!editando) return;
    const required_fields: RequiredFieldRule[] = REQUIRED_FIELD_OPTIONS
      .filter((o) => obrigatorios.has(o.field))
      .map((o) => (o.min !== undefined ? { field: o.field, min: o.min } : { field: o.field }));
    try {
      await salvar.mutateAsync({
        id: editando.id,
        auto_message_template: removendo ? null : template.trim() || null,
        auto_message_delay_hours: removendo ? 0 : Math.max(0, Number(delay) || 0),
        required_fields,
        move_on_reply: moveOnReply,
        move_on_reply_from_stage_id: moveOnReply && moveFrom !== QUALQUER_ANTERIOR ? moveFrom : null,
      });
      setEditando(null);
      toast.success(removendo ? "Automação removida." : "Configuração salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const etapas = ordemPendente
    ? ordemPendente.flatMap((id) => (stages ?? []).filter((s) => s.id === id))
    : stages ?? [];
  const pipelineId = funilId;

  const mover = (de: number, para: number) => {
    if (!pipelineId || reordenar.isPending) return;
    const ids = etapas.map((s) => s.id);
    const novaOrdem = moverEtapa(ids, de, para);
    if (novaOrdem.join() === ids.join()) return;
    setOrdemPendente(novaOrdem);
    reordenar.mutate(
      { pipelineId, stageIds: novaOrdem },
      {
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível reordenar as etapas."),
        onSettled: () => setOrdemPendente(null),
      },
    );
  };

  const soltar = (destino: number) => {
    const origem = etapas.findIndex((s) => s.id === arrastando);
    setArrastando(null);
    if (origem >= 0) mover(origem, destino);
  };

  return (
    <div className="space-y-4">
      <FunilToolbar funis={funis} funil={funil} etapas={etapas} onEscolher={escolher} />
      <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
        Quando um deal entra numa etapa com mensagem automática, ela é agendada para o contato
        vinculado após o atraso configurado. Mover o deal para outra etapa cancela o que ainda
        não foi enviado. Variáveis: {"{{contact.first_name}}"}, {"{{contact.last_name}}"}, {"{{contact.name}}"}.
        Etapas também podem exigir campos preenchidos para receber um negócio. Arraste pela alça
        ou use as setas para mudar a ordem das colunas do Kanban.
      </p>

      <ul className="space-y-2">
        {etapas.map((s, indice) => {
          const nRegras = parseRequiredFields(s.required_fields).length;
          return (
            <li
              key={s.id}
              className="via-card flex flex-wrap items-center gap-3 p-4"
              style={{ opacity: arrastando === s.id ? 0.5 : 1 }}
              data-testid="pipeline-stage-row"
              draggable
              onDragStart={(e) => {
                // O Firefox só inicia o arrastar se houver dado no evento.
                e.dataTransfer.setData("text/plain", s.id);
                e.dataTransfer.effectAllowed = "move";
                setArrastando(s.id);
              }}
              onDragOver={(e) => { if (arrastando) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); soltar(indice); }}
              onDragEnd={() => setArrastando(null)}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} aria-hidden />
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-32 font-medium" style={{ color: "var(--via-text-primary)" }}>{s.name}</span>
              <span className="flex-1 space-y-0.5 text-sm" style={{ color: "var(--via-text-muted)" }}>
                {s.auto_message_template ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                    Mensagem {s.auto_message_delay_hours ? `${s.auto_message_delay_hours}h depois` : "imediata"} —{" "}
                    <span className="line-clamp-1">{s.auto_message_template}</span>
                  </span>
                ) : (
                  <span className="block">Sem mensagem automática</span>
                )}
                {nRegras > 0 && (
                  <span className="flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                    {nRegras === 1 ? "1 campo obrigatório" : `${nRegras} campos obrigatórios`} para entrar
                  </span>
                )}
                {s.move_on_reply && (
                  <span className="flex items-center gap-1.5">
                    <MessageCircleReply className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                    Recebe o negócio quando o lead responde no WhatsApp
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="icon" variant="ghost" className="h-8 w-8" aria-label={`Subir a etapa ${s.name}`}
                  disabled={indice === 0} onClick={() => mover(indice, indice - 1)}
                  data-testid={`pipeline-stage-subir-${indice}`}
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8" aria-label={`Descer a etapa ${s.name}`}
                  disabled={indice === etapas.length - 1} onClick={() => mover(indice, indice + 1)}
                  data-testid={`pipeline-stage-descer-${indice}`}
                >
                  <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar a etapa ${s.name}`}
                  onClick={() => setFormulario(s)} data-testid={`pipeline-stage-editar-${indice}`}
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8" aria-label={`Excluir a etapa ${s.name}`}
                  onClick={() => setExcluindo(s)} data-testid={`pipeline-stage-excluir-${indice}`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => abrir(s)} data-testid={`pipeline-stage-config-${indice}`}>
                  <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Configurar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {pipelineId ? (
        <Button variant="outline" className="gap-1.5" onClick={() => setFormulario("nova")} data-testid="pipeline-stage-nova">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Nova etapa
        </Button>
      ) : (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nenhum funil ainda. Crie o primeiro em "Novo funil" ou pelo assistente de configuração inicial.
        </p>
      )}

      {formulario && pipelineId && (
        <StageFormDialog
          etapa={formulario === "nova" ? null : formulario}
          etapas={etapas}
          pipelineId={pipelineId}
          onClose={() => setFormulario(null)}
        />
      )}
      {excluindo && (
        <StageDeleteDialog etapa={excluindo} unica={etapas.length === 1} onClose={() => setExcluindo(null)} />
      )}

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar etapa · {editando?.name}</DialogTitle>
            <DialogDescription>
              Mensagem automática agendada quando um deal com contato vinculado entra nesta etapa,
              e campos exigidos para o negócio poder entrar nela.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="stage-template">Mensagem</Label>
              <Textarea
                id="stage-template"
                rows={4}
                placeholder="Olá {{contact.first_name}}! Vi que avançamos para a próxima etapa…"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                data-testid="stage-template"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-delay">Enviar após (horas)</Label>
              <Input
                id="stage-delay"
                type="number"
                min="0"
                className="w-32"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
                data-testid="stage-delay"
              />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                0 = na primeira verificação do envio (até 5 minutos).
              </p>
            </div>

            <Separator />

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                Campos obrigatórios para entrar nesta etapa
              </legend>
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Ao mover um negócio para cá (arrastando no Kanban ou pela ficha), o sistema
                bloqueia a movimentação e lista o que falta preencher.
              </p>
              {REQUIRED_FIELD_OPTIONS.map((opt) => (
                <label key={opt.field} className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-primary)" }}>
                  <Checkbox
                    checked={obrigatorios.has(opt.field)}
                    onCheckedChange={(v) => alternarCampo(opt.field, v === true)}
                    data-testid={`stage-required-${opt.field}`}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>

            <Separator />

            {/* Gatilho por resposta no WhatsApp (Parte 9 do Sprint 10A). */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                <Checkbox
                  checked={moveOnReply}
                  onCheckedChange={(v) => setMoveOnReply(v === true)}
                  data-testid="stage-move-on-reply"
                />
                Quando o lead responder via WhatsApp, mover o negócio para esta etapa
              </label>
              {moveOnReply && (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <span className="text-sm" style={{ color: "var(--via-text-body)" }}>
                    Aplica apenas se o negócio estiver em
                  </span>
                  <Select value={moveFrom} onValueChange={setMoveFrom}>
                    <SelectTrigger className="w-56" aria-label="Etapa de origem do gatilho" data-testid="stage-move-from">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={QUALQUER_ANTERIOR}>Qualquer etapa anterior</SelectItem>
                      {(stages ?? [])
                        .filter((s) => s.id !== editando?.id)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                              {s.name}
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="pl-6 text-xs" style={{ color: "var(--via-text-muted)" }}>
                Fecha o ciclo do follow-up: o lead responde e o negócio avança sozinho no kanban.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editando?.auto_message_template && (
              <Button variant="outline" onClick={() => submeter(true)} disabled={salvar.isPending}>
                Remover automação
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button onClick={() => submeter(false)} disabled={salvar.isPending} data-testid="stage-salvar">
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
