import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSaveEmailTemplate, type EmailTemplate } from "@/hooks/useEmailTemplates";
import { TEMPLATE_VARIABLES, renderTemplate, sampleContext } from "@/lib/templates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EmailTemplate | null;
}

export function TemplateFormDialog({ open, onOpenChange, template }: Props) {
  const isEdit = !!template;
  const saveTemplate = useSaveEmailTemplate();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState({ name: "", subject: "", body_html: "" });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: template?.name ?? "",
      subject: template?.subject ?? "",
      body_html: template?.body_html ?? "",
    });
  }, [open, template]);

  // Insere a variável na posição do cursor do corpo.
  const insertVariable = (token: string) => {
    const el = bodyRef.current;
    if (!el) {
      setForm((f) => ({ ...f, body_html: f.body_html + token }));
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = form.body_html.slice(0, start) + token + form.body_html.slice(end);
    setForm((f) => ({ ...f, body_html: next }));
    // Reposiciona o cursor após a variável.
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const submit = async () => {
    if (!form.name.trim() || !form.subject.trim()) {
      toast.error("Informe o nome e o assunto do template.");
      return;
    }
    try {
      await saveTemplate.mutateAsync({
        id: template?.id,
        name: form.name.trim(),
        subject: form.subject.trim(),
        body_html: form.body_html,
      });
      toast.success(isEdit ? "Template atualizado." : "Template criado.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o template.");
    }
  };

  const ctx = sampleContext();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar template" : "Novo template"}</DialogTitle>
          <DialogDescription>
            Use variáveis dinâmicas — elas são substituídas pelos dados do contato ao enviar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Nome</Label>
            <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-subject">Assunto</Label>
            <Input id="tpl-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => insertVariable(v.token)}
              className="rounded-full border px-2 py-0.5 text-xs"
              style={{ borderColor: "var(--via-border)", color: "var(--via-text-body)" }}
              title={v.label}
            >
              {v.token}
            </button>
          ))}
        </div>

        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Editar</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="pt-2">
            <Textarea
              ref={bodyRef}
              rows={12}
              value={form.body_html}
              onChange={(e) => setForm({ ...form, body_html: e.target.value })}
              placeholder="<p>Olá {{contact.first_name}},</p>"
              className="font-mono text-sm"
            />
          </TabsContent>
          <TabsContent value="preview" className="pt-2">
            <div className="via-card p-4">
              <p className="mb-2 border-b pb-2 text-sm font-medium" style={{ borderColor: "var(--via-border)", color: "var(--via-text-primary)" }}>
                {renderTemplate(form.subject, ctx) || "(sem assunto)"}
              </p>
              <div
                className="prose-sm max-w-none text-sm"
                style={{ color: "var(--via-text-body)" }}
                dangerouslySetInnerHTML={{ __html: renderTemplate(form.body_html, ctx) }}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saveTemplate.isPending}>
            {saveTemplate.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
