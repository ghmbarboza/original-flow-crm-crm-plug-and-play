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
import { useContacts } from "@/hooks/useContacts";
import { useDeals } from "@/hooks/useDeals";
import {
  ACTIVITY_TYPE_LABEL, useCreateActivity, useUpdateActivity,
  type Activity, type ActivityType,
} from "@/hooks/useActivities";

const NONE = "__none__";
const TYPES = Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, edita. */
  activity?: Activity | null;
  /** Vínculos pré-preenchidos (ex.: criar atividade a partir do detalhe de um deal). */
  presets?: { dealId?: string; contactId?: string; companyId?: string };
  /** Trava o tipo (ex.: /tasks só cria tarefas). */
  lockedType?: ActivityType;
  /** Esconde os seletores de vínculo (contexto já fixa o deal/contato). */
  hideLinks?: boolean;
}

export function ActivityFormDialog({ open, onOpenChange, activity, presets, lockedType, hideLinks }: Props) {
  const isEdit = !!activity;
  const { data: contacts } = useContacts();
  const { data: deals } = useDeals();
  const createActivity = useCreateActivity();
  const updateActivity = useUpdateActivity();

  const [form, setForm] = useState({
    type: lockedType ?? ("task" as ActivityType),
    title: "",
    body: "",
    due_date: "",
    contact_id: NONE,
    deal_id: NONE,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      type: activity?.type ?? lockedType ?? "task",
      title: activity?.title ?? "",
      body: activity?.body ?? "",
      due_date: activity?.due_date ? activity.due_date.slice(0, 10) : "",
      contact_id: activity?.contact_id ?? presets?.contactId ?? NONE,
      deal_id: activity?.deal_id ?? presets?.dealId ?? NONE,
    });
  }, [open, activity, presets, lockedType]);

  const isSaving = createActivity.isPending || updateActivity.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error("Informe o título da atividade.");
      return;
    }

    const payload = {
      type: form.type,
      title: form.title.trim(),
      body: form.body.trim() || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
      contact_id: form.contact_id === NONE ? null : form.contact_id,
      deal_id: form.deal_id === NONE ? null : form.deal_id,
      company_id: presets?.companyId ?? null,
    };

    try {
      if (isEdit && activity) {
        await updateActivity.mutateAsync({ id: activity.id, ...payload });
        toast.success("Atividade atualizada.");
      } else {
        await createActivity.mutateAsync(payload);
        toast.success("Atividade criada.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível salvar: ${error.message}`
          : "Não foi possível salvar a atividade. Tente novamente.",
      );
    }
  };

  const contactLabel = (c: { first_name: string; last_name: string | null }) =>
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(sem nome)";

  const noun = lockedType === "task" ? "tarefa" : "atividade";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? `Editar ${noun}` : `Nova ${noun}`}
            </DialogTitle>
            <DialogDescription>
              {lockedType === "task"
                ? "Uma tarefa com prazo, vinculável a um contato ou negócio."
                : "Ligação, email, reunião, nota ou tarefa vinculada a um contato ou negócio."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            {!lockedType && (
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm({ ...form, type: value as ActivityType })}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{ACTIVITY_TYPE_LABEL[type]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="due_date">Prazo</Label>
              <Input
                id="due_date"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="body">Descrição</Label>
              <Textarea
                id="body"
                rows={3}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>

            {!hideLinks && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="contact">Contato</Label>
                  <Select
                    value={form.contact_id}
                    onValueChange={(value) => setForm({ ...form, contact_id: value })}
                  >
                    <SelectTrigger id="contact">
                      <SelectValue placeholder="Sem contato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem contato</SelectItem>
                      {(contacts ?? []).map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contactLabel(contact)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deal">Negócio</Label>
                  <Select
                    value={form.deal_id}
                    onValueChange={(value) => setForm({ ...form, deal_id: value })}
                  >
                    <SelectTrigger id="deal">
                      <SelectValue placeholder="Sem negócio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem negócio</SelectItem>
                      {(deals ?? []).map((deal) => (
                        <SelectItem key={deal.id} value={deal.id}>{deal.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Salvando…" : isEdit ? "Salvar" : `Criar ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
