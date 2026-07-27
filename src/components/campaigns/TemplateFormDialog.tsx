import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCreateMessageTemplate } from "@/hooks/useMessageTemplates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Placeholders posicionais distintos do corpo, em ordem: {{1}}, {{2}}, ... */
function positionalParams(text: string): string[] {
  const found = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(found)].sort((a, b) => Number(a) - Number(b));
}

export function TemplateFormDialog({ open, onOpenChange }: Props) {
  const createTemplate = useCreateMessageTemplate();

  const [form, setForm] = useState({
    name: "",
    category: "UTILITY" as "MARKETING" | "UTILITY" | "AUTHENTICATION",
    language: "pt_BR",
    body: "",
    footer: "",
  });
  const [examples, setExamples] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm({ name: "", category: "UTILITY", language: "pt_BR", body: "", footer: "" });
      setExamples({});
    }
  }, [open]);

  const params = useMemo(() => positionalParams(form.body), [form.body]);
  const nameValid = /^[a-z][a-z0-9_]*$/.test(form.name);

  const submit = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      toast.error("Informe o nome e o corpo do template.");
      return;
    }
    if (!nameValid) {
      toast.error("Nome inválido. Use minúsculas, números e underscore, começando por letra.");
      return;
    }
    const missing = params.filter((p) => !examples[p]?.trim());
    if (missing.length > 0) {
      toast.error(`Informe um valor de exemplo para {{${missing[0]}}}.`);
      return;
    }
    try {
      const created = await createTemplate.mutateAsync({
        name: form.name.trim(),
        category: form.category,
        language: form.language.trim(),
        body_text: form.body.trim(),
        footer_text: form.footer.trim() || undefined,
        example_params: params.map((p) => examples[p].trim()),
      });
      toast.success(
        created.status === "APPROVED"
          ? `Template "${created.name}" aprovado e pronto para uso.`
          : `Template "${created.name}" enviado para revisão da Meta (pode levar até 24h).`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o template.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo template</DialogTitle>
          <DialogDescription>
            O WhatsApp exige um template aprovado para iniciar conversa de negócio. Use{" "}
            {"{{1}}"}, {"{{2}}"} como variáveis no corpo.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Nome</Label>
            <Input
              id="tpl-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })}
              placeholder="confirmacao_pedido"
              autoFocus
            />
            {form.name && !nameValid && (
              <p className="text-xs" style={{ color: "var(--via-danger, #dc2626)" }}>
                Use apenas minúsculas, números e underscore, começando por letra.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-category">Categoria</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as typeof form.category })}
              >
                <SelectTrigger id="tpl-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTILITY">Utilidade</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-lang">Idioma</Label>
              <Input
                id="tpl-lang"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                placeholder="pt_BR"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-body">Corpo</Label>
            <Textarea
              id="tpl-body"
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Olá {{1}}, seu pedido em {{2}} foi confirmado."
            />
          </div>

          {params.length > 0 && (
            <div className="space-y-2">
              <Label>Valores de exemplo</Label>
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                A Meta exige um exemplo por variável para revisar o template.
              </p>
              {params.map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <span
                    className="w-12 shrink-0 text-xs tabular-nums"
                    style={{ color: "var(--via-text-muted)" }}
                  >
                    {`{{${p}}}`}
                  </span>
                  <Input
                    value={examples[p] ?? ""}
                    onChange={(e) => setExamples({ ...examples, [p]: e.target.value })}
                    placeholder={p === "1" ? "Maria" : "exemplo"}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tpl-footer">Rodapé (opcional)</Label>
            <Input
              id="tpl-footer"
              value={form.footer}
              onChange={(e) => setForm({ ...form, footer: e.target.value })}
              placeholder="Equipe FlowCRM"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={createTemplate.isPending}>
            {createTemplate.isPending ? "Enviando…" : "Criar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
