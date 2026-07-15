import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCompanies } from "@/hooks/useCompanies";
import {
  CONTACT_STATUS_LABEL, useCreateContact, useUpdateContact,
  type Contact, type ContactStatus,
} from "@/hooks/useContacts";

const STATUSES = Object.keys(CONTACT_STATUS_LABEL) as ContactStatus[];
const NO_COMPANY = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, o diálogo edita em vez de criar. */
  contact?: Contact | null;
}

export function ContactFormDialog({ open, onOpenChange, contact }: Props) {
  const isEdit = !!contact;
  const { data: companies } = useCompanies();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    whatsapp_phone: "",
    title: "",
    status: "lead" as ContactStatus,
    company_id: NO_COMPANY,
    source: "",
  });

  // Recarrega o formulário sempre que o diálogo abre, para não vazar o estado da edição anterior.
  useEffect(() => {
    if (!open) return;
    setForm({
      first_name: contact?.first_name ?? "",
      last_name: contact?.last_name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      whatsapp_phone: contact?.whatsapp_phone ?? "",
      title: contact?.title ?? "",
      status: contact?.status ?? "lead",
      company_id: contact?.company_id ?? NO_COMPANY,
      source: contact?.source ?? "",
    });
  }, [open, contact]);

  const isSaving = createContact.isPending || updateContact.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.first_name.trim() && !form.email.trim() && !form.whatsapp_phone.trim()) {
      toast.error("Informe ao menos o nome, o email ou o WhatsApp do contato.");
      return;
    }

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp_phone: form.whatsapp_phone.trim() || null,
      title: form.title.trim() || null,
      status: form.status,
      company_id: form.company_id === NO_COMPANY ? null : form.company_id,
      source: form.source.trim() || null,
    };

    try {
      if (isEdit && contact) {
        await updateContact.mutateAsync({ id: contact.id, ...payload });
        toast.success("Contato atualizado.");
      } else {
        await createContact.mutateAsync(payload);
        toast.success("Contato criado.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível salvar: ${error.message}`
          : "Não foi possível salvar o contato. Tente novamente.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar contato" : "Novo contato"}</DialogTitle>
            <DialogDescription>
              Nome, email ou WhatsApp — ao menos um é necessário para identificar o contato.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">Nome</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Sobrenome</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp_phone">WhatsApp</Label>
              <Input
                id="whatsapp_phone"
                placeholder="5511999999999"
                value={form.whatsapp_phone}
                onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Cargo</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value as ContactStatus })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {CONTACT_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Select
                value={form.company_id}
                onValueChange={(value) => setForm({ ...form, company_id: value })}
              >
                <SelectTrigger id="company">
                  <SelectValue placeholder="Sem empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COMPANY}>Sem empresa</SelectItem>
                  {(companies ?? []).map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="source">Origem</Label>
              <Input
                id="source"
                placeholder="Indicação, site, campanha…"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Salvando…" : isEdit ? "Salvar" : "Criar contato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
