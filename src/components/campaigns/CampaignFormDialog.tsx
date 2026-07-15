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

const ALL = "all";
const TAG = "tag";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampaignFormDialog({ open, onOpenChange }: Props) {
  const { data: tags } = useTags();
  const createCampaign = useCreateCampaign();

  const [form, setForm] = useState({
    name: "",
    message: "",
    audience: ALL as "all" | "tag",
    tagId: "",
    scheduled: "",
  });

  useEffect(() => {
    if (open) setForm({ name: "", message: "", audience: ALL, tagId: "", scheduled: "" });
  }, [open]);

  const submit = async () => {
    if (!form.name.trim() || !form.message.trim()) {
      toast.error("Informe o nome e a mensagem da campanha.");
      return;
    }
    if (form.audience === TAG && !form.tagId) {
      toast.error("Escolha a tag do público.");
      return;
    }
    try {
      const { total } = await createCampaign.mutateAsync({
        name: form.name.trim(),
        message_template: form.message.trim(),
        audience_type: form.audience,
        source_tag_id: form.audience === TAG ? form.tagId : null,
        scheduled_at: form.scheduled ? new Date(form.scheduled).toISOString() : null,
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
            Envie uma mensagem em massa via API oficial. Use variáveis como {"{{nome}}"} para personalizar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="camp-name">Nome</Label>
            <Input id="camp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
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
