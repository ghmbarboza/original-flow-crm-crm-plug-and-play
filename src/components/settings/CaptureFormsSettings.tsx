import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Check, ClipboardList, Copy, Pencil, Plus, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useAutomations } from "@/hooks/useAutomations";
import {
  DEFAULT_CAPTURE_FIELDS, parseFields, slugify,
  useCaptureForms, useCaptureFormTargets, useDeleteCaptureForm,
  useSaveCaptureForm, useToggleCaptureFormActive,
  type CaptureField, type CaptureFieldType, type CaptureForm,
} from "@/hooks/useCaptureForms";

const NONE = "__none__";

const FIELD_TYPES: { value: CaptureFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "textarea", label: "Texto longo" },
];

/** URL pública de um formulário. */
function publicUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/f/${slug}`;
}

export default function CaptureFormsSettings() {
  const { data: forms, isLoading, error } = useCaptureForms();
  const toggleActive = useToggleCaptureFormActive();
  const deleteForm = useDeleteCaptureForm();

  const [editing, setEditing] = useState<CaptureForm | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CaptureForm | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setBuilderOpen(true);
  };
  const openEdit = (form: CaptureForm) => {
    setEditing(form);
    setBuilderOpen(true);
  };

  const copyLink = async (form: CaptureForm) => {
    try {
      await navigator.clipboard.writeText(publicUrl(form.slug));
      setCopiedId(form.id);
      toast.success("Link copiado.");
      setTimeout(() => setCopiedId((id) => (id === form.id ? null : id)), 1500);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const handleToggle = async (form: CaptureForm) => {
    try {
      await toggleActive.mutateAsync({ id: form.id, is_active: !form.is_active });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteForm.mutateAsync(pendingDelete.id);
      toast.success("Formulário excluído.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Formulários de captura
          </p>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Publique um formulário em <span className="font-mono">/f/&#123;slug&#125;</span> para
            capturar leads. Cada envio cria um contato e um negócio.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Novo formulário
        </Button>
      </div>

      {error && <ErrorState title="Não foi possível carregar os formulários" error={error} />}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (forms ?? []).length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum formulário ainda"
          description="Crie um formulário de captura para receber leads direto no seu funil."
          action={<Button onClick={openCreate}>Criar primeiro formulário</Button>}
        />
      ) : (
        <div className="space-y-3">
          {(forms ?? []).map((form) => (
            <div key={form.id} className="via-card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium" style={{ color: "var(--via-text-primary)" }}>
                    {form.name}
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      background: form.is_active ? "var(--via-mint-soft, rgba(16,185,129,0.12))" : "var(--via-surface)",
                      color: form.is_active ? "var(--via-mint, #10b981)" : "var(--via-text-muted)",
                    }}
                  >
                    {form.is_active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyLink(form)}
                  className="mt-0.5 inline-flex items-center gap-1.5 text-sm hover:underline"
                  style={{ color: "var(--via-text-muted)" }}
                  title="Copiar link público"
                >
                  <span className="font-mono">/f/{form.slug}</span>
                  {copiedId === form.id ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1">
                <div className="mr-1 flex items-center gap-2">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={() => handleToggle(form)}
                    aria-label={form.is_active ? "Desativar" : "Ativar"}
                  />
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(form)} aria-label="Editar">
                  <Pencil className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setPendingDelete(form)} aria-label="Excluir">
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CaptureFormBuilder open={builderOpen} onOpenChange={setBuilderOpen} form={editing} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este formulário?</AlertDialogTitle>
            <AlertDialogDescription>
              O link público <span className="font-mono">/f/{pendingDelete?.slug}</span> para de
              funcionar. Contatos e negócios já criados não são afetados.
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

interface BuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CaptureForm | null;
}

function CaptureFormBuilder({ open, onOpenChange, form }: BuilderProps) {
  const isEdit = !!form;
  const saveForm = useSaveCaptureForm();
  const { data: targets } = useCaptureFormTargets();
  const { data: automations } = useAutomations();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [fields, setFields] = useState<CaptureField[]>(DEFAULT_CAPTURE_FIELDS);
  const [isActive, setIsActive] = useState(true);
  const [pipelineId, setPipelineId] = useState<string>(NONE);
  const [stageId, setStageId] = useState<string>(NONE);
  const [automationId, setAutomationId] = useState<string>(NONE);

  useEffect(() => {
    if (!open) return;
    setName(form?.name ?? "");
    setSlug(form?.slug ?? "");
    setSlugTouched(!!form);
    const parsed = form ? parseFields(form.fields) : [];
    setFields(parsed.length > 0 ? parsed : DEFAULT_CAPTURE_FIELDS.map((f) => ({ ...f })));
    setIsActive(form?.is_active ?? true);
    setPipelineId(form?.target_pipeline_id ?? NONE);
    setStageId(form?.target_stage_id ?? NONE);
    setAutomationId(form?.automation_id ?? NONE);
  }, [open, form]);

  // Slug segue o nome enquanto o usuário não editar o slug manualmente.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const stagesForPipeline = useMemo(() => {
    if (!targets || pipelineId === NONE) return [];
    return targets.stages.filter((s) => s.pipeline_id === pipelineId);
  }, [targets, pipelineId]);

  const setField = (index: number, patch: Partial<CaptureField>) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  const addField = () =>
    setFields((prev) => [
      ...prev,
      { key: `campo_${prev.length + 1}`, label: "Novo campo", type: "text", required: false },
    ]);

  const removeField = (index: number) =>
    setFields((prev) => prev.filter((_, i) => i !== index));

  const moveField = (index: number, dir: -1 | 1) =>
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do formulário.");
      return;
    }
    if (fields.length === 0) {
      toast.error("Adicione ao menos um campo.");
      return;
    }
    if (fields.some((f) => !f.key.trim() || !f.label.trim())) {
      toast.error("Todo campo precisa de chave e rótulo.");
      return;
    }
    const keys = fields.map((f) => f.key.trim());
    if (new Set(keys).size !== keys.length) {
      toast.error("Há campos com chaves duplicadas.");
      return;
    }
    const hasEmail = fields.some((f) => f.type === "email" || f.key === "email");
    const hasName = fields.some((f) => f.key === "name" || f.type === "text");
    if (!hasName || !hasEmail) {
      toast.error("O formulário precisa de ao menos um campo de nome e um de e-mail.");
      return;
    }

    try {
      await saveForm.mutateAsync({
        id: form?.id,
        name: name.trim(),
        slug: slug.trim(),
        fields: fields.map((f) => ({ ...f, key: f.key.trim(), label: f.label.trim() })),
        is_active: isActive,
        target_pipeline_id: pipelineId === NONE ? null : pipelineId,
        target_stage_id: stageId === NONE ? null : stageId,
        automation_id: automationId === NONE ? null : automationId,
      });
      toast.success(isEdit ? "Formulário atualizado." : "Formulário criado.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o formulário.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar formulário" : "Novo formulário"}</DialogTitle>
          <DialogDescription>
            Defina os campos e para onde os leads capturados vão no seu funil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cf-name">Nome</Label>
              <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-slug">Slug (URL pública)</Label>
              <Input
                id="cf-slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                onBlur={() => setSlug(slugify(slug))}
                placeholder="meu-formulario"
              />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                /f/{slugify(slug) || "…"}
              </p>
            </div>
          </div>

          {/* Campos */}
          <div className="via-card space-y-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                Campos
              </p>
              <Button size="sm" variant="ghost" onClick={addField} className="gap-1">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                Adicionar
              </Button>
            </div>
            {fields.map((field, i) => (
              <div
                key={i}
                className="space-y-2 rounded-md p-2"
                style={{ background: "var(--via-surface)" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-8 flex-1"
                    placeholder="Rótulo"
                    value={field.label}
                    onChange={(e) => setField(i, { label: e.target.value })}
                  />
                  <Input
                    className="h-8 w-32 font-mono"
                    placeholder="chave"
                    value={field.key}
                    onChange={(e) => setField(i, { key: e.target.value })}
                  />
                  <Select
                    value={field.type}
                    onValueChange={(v) => setField(i, { type: v as CaptureFieldType })}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  {/* O Switch do Radix é <button>, e envolver botão em <label> não
                      lhe dá nome acessível — só o clique. Daí o aria-label. */}
                  <label className="flex items-center gap-2 text-xs" style={{ color: "var(--via-text-body)" }}>
                    <Switch
                      aria-label={`Tornar o campo "${field.label || `nº ${i + 1}`}" obrigatório`}
                      checked={field.required}
                      onCheckedChange={(v) => setField(i, { required: v })}
                    />
                    Obrigatório
                  </label>
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => moveField(i, -1)}
                      disabled={i === 0}
                      aria-label="Mover para cima"
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => moveField(i, 1)}
                      disabled={i === fields.length - 1}
                      aria-label="Mover para baixo"
                    >
                      <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => removeField(i)}
                      aria-label="Remover campo"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Ao menos um campo de nome e um de e-mail são obrigatórios — eles viram o contato.
            </p>
          </div>

          {/* Destino */}
          <div className="via-card space-y-3 p-3">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Destino do lead
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-normal">Funil</Label>
                <Select
                  value={pipelineId}
                  onValueChange={(v) => {
                    setPipelineId(v);
                    setStageId(NONE);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Funil padrão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Funil padrão da org</SelectItem>
                    {(targets?.pipelines ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal">Etapa</Label>
                <Select value={stageId} onValueChange={setStageId} disabled={pipelineId === NONE}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Primeira etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Primeira etapa do funil</SelectItem>
                    {stagesForPipeline.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-normal">Automação ao capturar (opcional)</Label>
              <Select value={automationId} onValueChange={setAutomationId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {(automations ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
            <Switch
              aria-label="Formulário ativo (link público aceita envios)"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            Formulário ativo (link público aceita envios)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saveForm.isPending}>
            {saveForm.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar formulário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
