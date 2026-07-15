import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ON_LIMIT_OPTIONS, useDeleteFollowupStep, useFollowupConfig, useFollowupSteps,
  useSaveFollowupStep, useUpsertFollowupConfig, type FollowupStep,
} from "@/hooks/useFollowup";

/** Variáveis disponíveis nos templates de mensagem. */
const VARIABLES = ["{{nome}}", "{{empresa}}", "{{agente}}"];

function StepRow({ step, index }: { step: FollowupStep; index: number }) {
  const saveStep = useSaveFollowupStep();
  const deleteStep = useDeleteFollowupStep();
  const [delay, setDelay] = useState(String(step.delay_hours));
  const [template, setTemplate] = useState(step.message_template);
  const dirty = delay !== String(step.delay_hours) || template !== step.message_template;

  const save = async () => {
    if (!template.trim()) {
      toast.error("Escreva a mensagem da etapa.");
      return;
    }
    try {
      await saveStep.mutateAsync({
        id: step.id,
        delay_hours: Math.max(0, Number(delay) || 0),
        message_template: template.trim(),
        order: step.order,
      });
      toast.success("Etapa salva.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  const remove = async () => {
    try {
      await deleteStep.mutateAsync(step.id);
      toast.success("Etapa removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover.");
    }
  };

  return (
    <div className="via-card space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
          style={{ background: "var(--via-navy)", color: "var(--via-white)" }}
        >
          {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <Label className="text-xs font-normal" htmlFor={`delay-${step.id}`}>Enviar após</Label>
          <Input
            id={`delay-${step.id}`}
            type="number"
            min="0"
            className="h-8 w-20"
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
          />
          <span className="text-sm" style={{ color: "var(--via-text-muted)" }}>horas</span>
        </div>
        <Button size="icon" variant="ghost" onClick={remove} aria-label="Remover etapa">
          <Trash2 className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>
      <Textarea
        rows={2}
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        placeholder="Olá {{nome}}, ainda posso te ajudar?"
      />
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saveStep.isPending}>Salvar etapa</Button>
        </div>
      )}
    </div>
  );
}

export default function FollowupSettings() {
  const { data: config, isLoading } = useFollowupConfig();
  const { data: steps, isLoading: loadingSteps } = useFollowupSteps();
  const upsert = useUpsertFollowupConfig();
  const saveStep = useSaveFollowupStep();

  const [form, setForm] = useState({ is_active: false, max_attempts: 3, on_limit_reached: "mark_inactive" });

  useEffect(() => {
    if (!config) return;
    setForm({
      is_active: config.is_active,
      max_attempts: config.max_attempts ?? 3,
      on_limit_reached: config.on_limit_reached ?? "mark_inactive",
    });
  }, [config]);

  const saveConfig = async (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    try {
      await upsert.mutateAsync(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  const addStep = async () => {
    try {
      await saveStep.mutateAsync({
        delay_hours: 24,
        message_template: "",
        order: (steps?.length ?? 0),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a etapa.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="via-card flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Follow-up automático</p>
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Reengaja conversas de WhatsApp sem resposta seguindo a régua abaixo.
            </p>
          </div>
        </div>
        <Switch checked={form.is_active} onCheckedChange={(v) => saveConfig({ is_active: v })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="max_attempts">Número máximo de tentativas</Label>
          <Input
            id="max_attempts"
            type="number"
            min="1"
            value={form.max_attempts}
            onChange={(e) => setForm({ ...form, max_attempts: Number(e.target.value) })}
            onBlur={() => saveConfig({})}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="on_limit">Ao atingir o limite</Label>
          <Select value={form.on_limit_reached} onValueChange={(v) => saveConfig({ on_limit_reached: v })}>
            <SelectTrigger id="on_limit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ON_LIMIT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" strokeWidth={1.5} />
            Régua de etapas
          </Label>
          <Button size="sm" variant="outline" onClick={addStep} className="gap-1.5" disabled={saveStep.isPending}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova etapa
          </Button>
        </div>

        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Variáveis disponíveis: {VARIABLES.map((v) => <code key={v} className="mx-0.5 rounded px-1" style={{ background: "var(--via-surface)" }}>{v}</code>)}
        </p>

        {loadingSteps ? (
          <Skeleton className="h-24 w-full" />
        ) : (steps ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
            Nenhuma etapa ainda. Adicione a primeira mensagem da régua de follow-up.
          </p>
        ) : (
          <div className="space-y-2">
            {(steps ?? []).map((step, index) => (
              <StepRow key={step.id} step={step} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
