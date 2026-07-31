import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useStages, useUpdateStageConfig, type PipelineStage } from "@/hooks/useDeals";

/**
 * Configurações > Pipeline — automações por etapa.
 *
 * As etapas em si (nome, cor, ordem) nascem no setup e não são editadas aqui;
 * esta aba configura o que acontece QUANDO um deal entra em cada etapa. Hoje:
 * mensagem automática (Parte 3 do Sprint 10A). As Partes 5 (campos
 * obrigatórios) e 9 (gatilho por resposta) estendem esta mesma tela.
 *
 * O agendamento em si é o trigger schedule_stage_message no banco — esta tela
 * só grava o template e o delay na etapa.
 */
export default function PipelineSettings() {
  const { data: stages, isLoading } = useStages();
  const salvar = useUpdateStageConfig();

  const [editando, setEditando] = useState<PipelineStage | null>(null);
  const [template, setTemplate] = useState("");
  const [delay, setDelay] = useState("0");

  const abrir = (s: PipelineStage) => {
    setEditando(s);
    setTemplate(s.auto_message_template ?? "");
    setDelay(String(s.auto_message_delay_hours ?? 0));
  };

  const submeter = async (removendo = false) => {
    if (!editando) return;
    try {
      await salvar.mutateAsync({
        id: editando.id,
        auto_message_template: removendo ? null : template.trim() || null,
        auto_message_delay_hours: removendo ? 0 : Math.max(0, Number(delay) || 0),
      });
      setEditando(null);
      toast.success(removendo ? "Automação removida." : "Automação salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
        Quando um deal entra numa etapa com mensagem automática, ela é agendada para o contato
        vinculado após o atraso configurado. Mover o deal para outra etapa cancela o que ainda
        não foi enviado. Variáveis: {"{{contact.first_name}}"}, {"{{contact.last_name}}"}, {"{{contact.name}}"}.
      </p>

      <ul className="space-y-2">
        {(stages ?? []).map((s) => (
          <li key={s.id} className="via-card flex flex-wrap items-center gap-3 p-4" data-testid="pipeline-stage-row">
            <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-32 font-medium" style={{ color: "var(--via-text-primary)" }}>{s.name}</span>
            <span className="flex-1 text-sm" style={{ color: "var(--via-text-muted)" }}>
              {s.auto_message_template ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  Mensagem {s.auto_message_delay_hours ? `${s.auto_message_delay_hours}h depois` : "imediata"} —{" "}
                  <span className="line-clamp-1">{s.auto_message_template}</span>
                </span>
              ) : (
                "Sem mensagem automática"
              )}
            </span>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => abrir(s)} data-testid={`pipeline-stage-config-${s.order}`}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              Configurar
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mensagem automática · {editando?.name}</DialogTitle>
            <DialogDescription>
              Agendada quando um deal com contato vinculado entra nesta etapa. Deixe a mensagem
              vazia (ou use "Remover") para desligar.
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
