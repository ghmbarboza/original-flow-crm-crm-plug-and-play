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
import { FIELD_TYPE_LABELS, SHOW_WHEN_LABELS, type ShowWhenOp } from "@/lib/formRules";
import { Textarea } from "@/components/ui/textarea";
import { Code2 } from "lucide-react";

const NONE = "__none__";

const FIELD_TYPES = (Object.keys(FIELD_TYPE_LABELS) as CaptureFieldType[]).map((value) => ({ value, label: FIELD_TYPE_LABELS[value] }));
const COM_OPCOES: CaptureFieldType[] = ["select", "radio"];

/** URL pública de um formulário. */
function publicUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/f/${slug}`;
}

/** Códigos de embed para o site do cliente: script (ajusta altura e repassa UTMs) e iframe simples. */
function embedCodes(slug: string): { script: string; iframe: string } {
  const functions = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  return {
    script: `<script src="${functions}/capture-form-embed?form=${slug}" async></script>`,
    iframe: `<iframe src="${publicUrl(slug)}?embed=1" style="width:100%;min-height:520px;border:0" title="Formulário" loading="lazy"></iframe>`,
  };
}

export default function CaptureFormsSettings() {
  const { data: forms, isLoading, error } = useCaptureForms();
  const toggleActive = useToggleCaptureFormActive();
  const deleteForm = useDeleteCaptureForm();

  const [editing, setEditing] = useState<CaptureForm | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CaptureForm | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [embedDe, setEmbedDe] = useState<CaptureForm | null>(null);

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
            Formulários
          </p>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Página própria em <span className="font-mono">/f/&#123;slug&#125;</span> ou embed no seu site.
            Cada envio cria um contato com a origem da campanha (UTM) e um negócio no funil.
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
                <span className="mr-2 text-xs" style={{ color: "var(--via-text-muted)" }} data-testid={`form-envios-${form.slug}`}>
                  {form.submissions_count ?? 0} envio{(form.submissions_count ?? 0) === 1 ? "" : "s"}
                </span>
                <Button size="icon" variant="ghost" onClick={() => setEmbedDe(form)} aria-label="Código de embed" title="Código de embed">
                  <Code2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
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
      <EmbedDialog form={embedDe} onClose={() => setEmbedDe(null)} />

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

function EmbedDialog({ form, onClose }: { form: CaptureForm | null; onClose: () => void }) {
  const codes = form ? embedCodes(form.slug) : null;
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Código copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };
  return (
    <Dialog open={!!form} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Embed no seu site</DialogTitle>
          <DialogDescription>
            Cole um dos códigos na página. O script ajusta a altura sozinho e repassa as UTMs da página para a origem do lead.
          </DialogDescription>
        </DialogHeader>
        {codes && (
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-normal">Script (recomendado)</Label>
                <Button size="sm" variant="ghost" onClick={() => copiar(codes.script)} data-testid="embed-copy-script">Copiar</Button>
              </div>
              <pre className="overflow-x-auto rounded-md p-3 text-xs" style={{ background: "var(--via-surface)" }} data-testid="embed-script">{codes.script}</pre>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-normal">Iframe</Label>
                <Button size="sm" variant="ghost" onClick={() => copiar(codes.iframe)}>Copiar</Button>
              </div>
              <pre className="overflow-x-auto rounded-md p-3 text-xs" style={{ background: "var(--via-surface)" }}>{codes.iframe}</pre>
            </div>
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Link direto: <span className="font-mono">{publicUrl(form!.slug)}</span>. Parâmetros utm_source, utm_medium, utm_campaign, gclid e fbclid na URL viram a origem e os campos do contato.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
  const [sourceDefault, setSourceDefault] = useState("capture_form");
  const [successMessage, setSuccessMessage] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [consentText, setConsentText] = useState("");
  const [corPrimaria, setCorPrimaria] = useState("");

  useEffect(() => {
    if (!open) return;
    setSourceDefault(form?.source_default ?? "capture_form");
    setSuccessMessage(form?.success_message ?? "");
    setRedirectUrl(form?.redirect_url ?? "");
    setConsentText(form?.consent_text ?? "");
    setCorPrimaria(((form?.theme as { primary?: string } | null)?.primary) ?? "");
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
    const hasPhone = fields.some((f) => f.type === "phone" || f.key === "phone");
    const hasName = fields.some((f) => f.key === "name" || f.type === "text");
    if (!hasName || !(hasEmail || hasPhone)) {
      toast.error("O formulário precisa de um campo de nome e de um de e-mail ou telefone.");
      return;
    }
    if (fields.some((f) => COM_OPCOES.includes(f.type) && !(f.options ?? []).length)) {
      toast.error("Campos de lista e escolha única precisam de opções.");
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
        source_default: sourceDefault,
        success_message: successMessage,
        redirect_url: redirectUrl,
        consent_text: consentText,
        theme: corPrimaria.trim() ? { primary: corPrimaria.trim() } : {},
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
                {COM_OPCOES.includes(field.type) && (
                  <Input
                    className="h-8"
                    placeholder="Opções separadas por vírgula (ex.: Plano mensal, Plano anual)"
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) => setField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                    aria-label={`Opções do campo ${field.label}`}
                    data-testid={`campo-opcoes-${i}`}
                  />
                )}
                {field.type === "hidden" && (
                  <Input className="h-8" placeholder="Valor fixo gravado no envio" value={field.value ?? ""}
                    onChange={(e) => setField(i, { value: e.target.value })} aria-label={`Valor fixo do campo ${field.label}`} />
                )}
                {field.type !== "hidden" && (
                  <Input className="h-8" placeholder="Texto de apoio (opcional)" value={field.help ?? ""}
                    onChange={(e) => setField(i, { help: e.target.value })} aria-label={`Texto de apoio do campo ${field.label}`} />
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--via-text-body)" }}>
                  <span>Mostrar quando</span>
                  <Select
                    value={field.show_when?.field ?? "__sempre__"}
                    onValueChange={(v) => setField(i, { show_when: v === "__sempre__" ? null : { field: v, op: field.show_when?.op ?? "eq", value: field.show_when?.value ?? "" } })}
                  >
                    <SelectTrigger className="h-8 w-40" aria-label={`Campo que controla ${field.label}`} data-testid={`campo-condicao-${i}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__sempre__">sempre</SelectItem>
                      {fields.filter((_, j) => j !== i && fields[j].key.trim()).map((outro) => (
                        <SelectItem key={outro.key} value={outro.key}>{outro.label || outro.key}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.show_when && (
                    <>
                      <Select value={field.show_when.op} onValueChange={(v) => setField(i, { show_when: { ...field.show_when!, op: v as ShowWhenOp } })}>
                        <SelectTrigger className="h-8 w-40" aria-label="Operador da condição"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SHOW_WHEN_LABELS) as ShowWhenOp[]).map((op) => <SelectItem key={op} value={op}>{SHOW_WHEN_LABELS[op]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {field.show_when.op !== "not_empty" && (
                        <Input className="h-8 w-40" placeholder="valor" value={field.show_when.value ?? ""}
                          onChange={(e) => setField(i, { show_when: { ...field.show_when!, value: e.target.value } })} aria-label="Valor da condição" data-testid={`campo-condicao-valor-${i}`} />
                      )}
                    </>
                  )}
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
              Nome e e-mail (ou telefone) viram o contato; os demais campos ficam na ficha como campos extras.
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

          <div className="via-card space-y-3 p-3">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Origem, aparência e depois do envio</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cf-source" className="text-xs font-normal">Origem padrão do contato</Label>
                <Input id="cf-source" className="h-9" value={sourceDefault} onChange={(e) => setSourceDefault(e.target.value)} placeholder="capture_form" />
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Se a página tiver utm_source, ele vence.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-color" className="text-xs font-normal">Cor principal (opcional)</Label>
                <Input id="cf-color" className="h-9" value={corPrimaria} onChange={(e) => setCorPrimaria(e.target.value)} placeholder="#1F5EFF" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cf-success" className="text-xs font-normal">Mensagem de sucesso</Label>
                <Textarea id="cf-success" rows={2} value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} placeholder="Obrigado pelo interesse. Em breve entraremos em contato." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-redirect" className="text-xs font-normal">Redirecionar para (opcional)</Label>
                <Input id="cf-redirect" className="h-9" value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://seusite.com.br/obrigado" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-consent" className="text-xs font-normal">Texto de consentimento (opcional)</Label>
                <Input id="cf-consent" className="h-9" value={consentText} onChange={(e) => setConsentText(e.target.value)} placeholder="Ao enviar, você concorda em receber contato." />
              </div>
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
