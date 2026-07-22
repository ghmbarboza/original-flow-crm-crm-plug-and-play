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
import { useSendEmail } from "@/hooks/useEmails";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";

const NO_TEMPLATE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-preenche destinatário/thread ao responder. */
  preset?: { to?: string; subject?: string; contactId?: string | null; threadId?: string | null };
}

export function ComposeEmailDialog({ open, onOpenChange, preset }: Props) {
  const sendEmail = useSendEmail();
  const { data: templates } = useEmailTemplates();

  const [form, setForm] = useState({ to: "", subject: "", body: "" });

  useEffect(() => {
    if (open) {
      setForm({ to: preset?.to ?? "", subject: preset?.subject ?? "", body: "" });
    }
  }, [open, preset]);

  const applyTemplate = (id: string) => {
    if (id === NO_TEMPLATE) return;
    const template = templates?.find((t) => t.id === id);
    if (!template) return;
    setForm((f) => ({ ...f, subject: template.subject, body: template.body_html }));
  };

  const submit = async () => {
    if (!form.to.trim() || !form.subject.trim()) {
      toast.error("Informe o destinatário e o assunto.");
      return;
    }
    try {
      await sendEmail.mutateAsync({
        to: form.to.trim(),
        subject: form.subject.trim(),
        body_html: form.body,
        contact_id: preset?.contactId ?? null,
        thread_id: preset?.threadId ?? null,
      });
      toast.success("Email enviado.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o email.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo email</DialogTitle>
          <DialogDescription>Enviado pela sua conta do Gmail conectada.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="to">Para</Label>
              <Input id="to" type="email" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="cliente@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template">Template</Label>
              <Select defaultValue={NO_TEMPLATE} onValueChange={applyTemplate}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Sem template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Sem template</SelectItem>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Assunto</Label>
            <Input id="subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Mensagem</Label>
            <Textarea id="body" rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Escreva sua mensagem…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={sendEmail.isPending}>
            {sendEmail.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
