import { useEffect, useState } from "react";
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
import { useTags } from "@/hooks/useTags";
import { useCreateCampaign } from "@/hooks/useCampaigns";
import { useMessageTemplates } from "@/hooks/useMessageTemplates";

const ALL = "all";
const TAG = "tag";
const NO_TEMPLATE = "__none__";

const PROVIDER_LABEL: Record<string, string> = {
  meta_official: "API Oficial (Meta)",
  zernio: "Zernio",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provedor configurado na org — é quem entrega a campanha. */
  provider: "meta_official" | "zernio";
}

export function CampaignFormDialog({ open, onOpenChange, provider }: Props) {
  const { data: tags } = useTags();
  const createCampaign = useCreateCampaign();
  // Só templates aprovados podem ser disparados.
  const { data: templateData, isLoading: loadingTemplates } = useMessageTemplates(open);
  const approved = (templateData?.templates ?? []).filter((t) => t.status === "APPROVED");

  // No Zernio o template é obrigatório: o WhatsApp recusa mensagem livre para
  // abrir conversa. Na Meta ele é opcional (texto livre entrega na janela de 24h).
  const templateRequired = provider === "zernio";

  const [form, setForm] = useState({
    name: "",
    message: "",
    audience: ALL as "all" | "tag",
    tagId: "",
    scheduled: "",
    templateName: NO_TEMPLATE,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: "", message: "", audience: ALL, tagId: "", scheduled: "",
        templateName: NO_TEMPLATE,
      });
    }
  }, [open]);

  const selectedTemplate = approved.find((t) => t.name === form.templateName) ?? null;
  const paramCount = (form.message.match(/\{\{(\w+)\}\}/g) ?? []).length;

  const submit = async () => {
    if (!form.name.trim() || !form.message.trim()) {
      toast.error("Informe o nome e a mensagem da campanha.");
      return;
    }
    if (form.audience === TAG && !form.tagId) {
      toast.error("Escolha a tag do público.");
      return;
    }
    if (templateRequired && !selectedTemplate) {
      toast.error("Campanhas pelo Zernio exigem um template aprovado.");
      return;
    }
    if (selectedTemplate && selectedTemplate.param_count !== paramCount) {
      toast.error(
        `O template "${selectedTemplate.name}" espera ${selectedTemplate.param_count} variável(is), `
        + `mas a mensagem tem ${paramCount}.`,
      );
      return;
    }
    try {
      const { total } = await createCampaign.mutateAsync({
        name: form.name.trim(),
        message_template: form.message.trim(),
        audience_type: form.audience,
        source_tag_id: form.audience === TAG ? form.tagId : null,
        scheduled_at: form.scheduled ? new Date(form.scheduled).toISOString() : null,
        provider,
        template_name: selectedTemplate?.name ?? null,
        template_language: selectedTemplate?.language ?? null,
      });
      toast.success(`Campanha criada com ${total} destinatário(s).`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a campanha.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Enviada por <strong>{PROVIDER_LABEL[provider] ?? provider}</strong>. Use variáveis como{" "}
            {"{{nome}}"} e {"{{empresa}}"} para personalizar.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          <div className="space-y-2">
            <Label htmlFor="camp-name">Nome</Label>
            <Input id="camp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="camp-template">
              Template{templateRequired ? "" : " (opcional)"}
            </Label>
            <Select
              value={form.templateName}
              onValueChange={(v) => setForm({ ...form, templateName: v })}
              disabled={loadingTemplates}
            >
              <SelectTrigger id="camp-template">
                <SelectValue placeholder={loadingTemplates ? "Carregando…" : "Escolha o template"} />
              </SelectTrigger>
              <SelectContent>
                {!templateRequired && <SelectItem value={NO_TEMPLATE}>Sem template (texto livre)</SelectItem>}
                {approved.map((tpl) => (
                  <SelectItem key={`${tpl.name}-${tpl.language}`} value={tpl.name}>
                    {tpl.name} · {tpl.language} · {tpl.param_count} var.
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingTemplates && approved.length === 0 && (
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Nenhum template aprovado ainda. Crie um na aba Templates.
              </p>
            )}
            {templateRequired && (
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                O WhatsApp não permite mensagem livre para iniciar conversa — o Zernio exige template.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="camp-msg">Mensagem</Label>
            <Textarea
              id="camp-msg"
              rows={4}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Olá {{nome}}, temos uma novidade para você…"
            />
            {selectedTemplate && (
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                As variáveis viram os valores do template, na ordem em que aparecem. O template
                espera {selectedTemplate.param_count} — a mensagem tem {paramCount}.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="camp-audience">Público</Label>
              <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v as "all" | "tag" })}>
                <SelectTrigger id="camp-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos com WhatsApp</SelectItem>
                  <SelectItem value={TAG}>Por tag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.audience === TAG && (
              <div className="space-y-2">
                <Label htmlFor="camp-tag">Tag</Label>
                <Select value={form.tagId} onValueChange={(v) => setForm({ ...form, tagId: v })}>
                  <SelectTrigger id="camp-tag">
                    <SelectValue placeholder="Escolha a tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tags ?? []).map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="camp-schedule">Agendamento (opcional)</Label>
            <Input
              id="camp-schedule"
              type="datetime-local"
              value={form.scheduled}
              onChange={(e) => setForm({ ...form, scheduled: e.target.value })}
            />
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Deixe vazio para criar como rascunho e disparar manualmente.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={createCampaign.isPending}>
            {createCampaign.isPending ? "Criando…" : "Criar campanha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
