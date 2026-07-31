import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LinkBiblioteca } from "@/components/library/LinkBiblioteca";
import { Clock, Paperclip, Plus, RefreshCw, Trash2, X } from "lucide-react";
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
  useSaveFollowupStep, useUploadFollowupMedia, useUpsertFollowupConfig,
  type FollowupStep, type FollowupStepMedia,
} from "@/hooks/useFollowup";
import { FollowupExecucoes } from "@/components/settings/FollowupExecucoes";

/** Variáveis disponíveis nos templates de mensagem. */
const VARIABLES = ["{{nome}}", "{{empresa}}", "{{agente}}"];

const MEDIA_TYPES = [
  { value: "image", label: "Imagem", accept: "image/*" },
  { value: "document", label: "PDF", accept: ".pdf,application/pdf" },
  { value: "video", label: "Vídeo", accept: "video/*" },
] as const;

const SEM_ANEXO = "__none__";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StepRow({ step, index }: { step: FollowupStep; index: number }) {
  const saveStep = useSaveFollowupStep();
  const deleteStep = useDeleteFollowupStep();
  const uploadMedia = useUploadFollowupMedia();
  const fileRef = useRef<HTMLInputElement>(null);

  const [delay, setDelay] = useState(String(step.delay_hours));
  const [template, setTemplate] = useState(step.message_template);
  // Anexo (Parte 10): tipo + arquivo do bucket OU URL externa.
  const [mediaType, setMediaType] = useState<string>(step.media_type ?? SEM_ANEXO);
  const [mediaUrl, setMediaUrl] = useState(step.media_url ?? "");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const mediaDirty =
    mediaType !== (step.media_type ?? SEM_ANEXO) ||
    mediaUrl !== (step.media_url ?? "") ||
    !!pendingFile;
  const dirty = delay !== String(step.delay_hours) || template !== step.message_template || mediaDirty;

  const save = async () => {
    if (!template.trim()) {
      toast.error("Escreva a mensagem da etapa.");
      return;
    }
    try {
      let media: FollowupStepMedia;
      if (mediaType === SEM_ANEXO) {
        media = { media_type: null, media_path: null, media_url: null, media_filename: null };
      } else if (pendingFile) {
        const path = await uploadMedia.mutateAsync({ stepId: step.id, file: pendingFile });
        media = {
          media_type: mediaType as FollowupStepMedia["media_type"],
          media_path: path,
          media_url: null,
          media_filename: pendingFile.name,
        };
      } else if (mediaUrl.trim()) {
        media = {
          media_type: mediaType as FollowupStepMedia["media_type"],
          media_path: null,
          media_url: mediaUrl.trim(),
          media_filename: mediaUrl.trim().split("/").pop() ?? null,
        };
      } else if (step.media_path) {
        // Tipo mantido, arquivo já enviado antes: preserva.
        media = {
          media_type: mediaType as FollowupStepMedia["media_type"],
          media_path: step.media_path,
          media_url: null,
          media_filename: step.media_filename,
        };
      } else {
        toast.error("Escolha um arquivo ou informe a URL do anexo.");
        return;
      }

      await saveStep.mutateAsync({
        id: step.id,
        delay_hours: Math.max(0, Number(delay) || 0),
        message_template: template.trim(),
        order: step.order,
        ...media,
      });
      setPendingFile(null);
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

  const acceptDoTipo = MEDIA_TYPES.find((t) => t.value === mediaType)?.accept;
  const anexoAtual =
    pendingFile
      ? `${pendingFile.name} (${formatSize(pendingFile.size)})`
      : mediaType !== SEM_ANEXO && step.media_type === mediaType && (step.media_filename || step.media_url)
        ? step.media_filename ?? step.media_url
        : null;

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

      {/* Anexo opcional (Parte 10): a mensagem sai com a mídia junto. */}
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs font-normal" htmlFor={`media-type-${step.id}`}>Anexo</Label>
        <Select
          value={mediaType}
          onValueChange={(v) => {
            setMediaType(v);
            setPendingFile(null);
            if (v === SEM_ANEXO) setMediaUrl("");
          }}
        >
          <SelectTrigger id={`media-type-${step.id}`} className="h-8 w-32" data-testid={`followup-media-type-${index}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_ANEXO}>Nenhum</SelectItem>
            {MEDIA_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {mediaType !== SEM_ANEXO && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={acceptDoTipo}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) {
                  setPendingFile(f);
                  setMediaUrl("");
                }
              }}
            />
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => fileRef.current?.click()}>
              <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} />
              Escolher arquivo
            </Button>
            <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>ou</span>
            <Input
              className="h-8 w-56"
              placeholder="URL do arquivo"
              value={mediaUrl}
              onChange={(e) => {
                setMediaUrl(e.target.value);
                setPendingFile(null);
              }}
              aria-label="URL do anexo"
            />
          </>
        )}
      </div>

      {anexoAtual && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--via-text-body)" }} data-testid={`followup-media-preview-${index}`}>
          <Paperclip className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="truncate">{anexoAtual}</span>
          {pendingFile && (
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              aria-label="Descartar arquivo escolhido"
              className="rounded p-0.5 hover:bg-accent"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
        </p>
      )}

      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saveStep.isPending || uploadMedia.isPending}>
            {uploadMedia.isPending ? "Enviando anexo…" : "Salvar etapa"}
          </Button>
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
        <Switch
          aria-label="Ativar o follow-up automático"
          checked={form.is_active}
          onCheckedChange={(v) => saveConfig({ is_active: v })}
        />
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
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Nenhuma etapa ainda. Comece do zero ou use uma régua pronta da Biblioteca.
            </p>
            <LinkBiblioteca categoria="followup" rotulo="Ver réguas prontas" />
          </div>
        ) : (
          <div className="space-y-2">
            {(steps ?? []).map((step, index) => (
              <StepRow key={step.id} step={step} index={index} />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Reorganização de 2026-07-31: a tela de USO (/followup) foi unificada
          aqui — configuração da régua acima, o que ela está fazendo abaixo. */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Clock className="h-4 w-4" strokeWidth={1.5} />
          Conversas na régua
        </Label>
        <FollowupExecucoes />
      </div>
    </div>
  );
}
