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
import { useContacts } from "@/hooks/useContacts";
import { useOrganization } from "@/hooks/useSetup";
import { escondeEmpresa, exigeEmpresa } from "@/lib/produtos";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import {
  useCreateDeal, useStages, useUpdateDeal, type Deal,
} from "@/hooks/useDeals";

const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, o diálogo edita em vez de criar. */
  deal?: Deal | null;
  /** Etapa inicial ao criar (ex.: botão "+" no topo de uma coluna do Kanban). */
  defaultStageId?: string | null;
  /** Contato já vinculado (criar negócio a partir da ficha ou da conversa). */
  defaultContactId?: string | null;
  /** Título sugerido, para quem chega pelo contato não escrever do zero. */
  defaultTitle?: string;
}

export function DealFormDialog({
  open, onOpenChange, deal, defaultStageId, defaultContactId, defaultTitle,
}: Props) {
  const isEdit = !!deal;
  const { data: stages } = useStages();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();
  const { data: members } = useOrgMembers();
  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const { data: org } = useOrganization();
  const modelo = (org as { business_model?: string } | null | undefined)?.business_model ?? "mixed";

  const [form, setForm] = useState({
    title: "",
    value: "",
    stage_id: NONE,
    contact_id: NONE,
    company_id: NONE,
    owner_id: NONE,
    close_date: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      title: deal?.title ?? defaultTitle ?? "",
      value: deal ? String(deal.value ?? "") : "",
      stage_id: deal?.stage_id ?? defaultStageId ?? NONE,
      contact_id: deal?.contact_id ?? defaultContactId ?? NONE,
      company_id: deal?.company_id ?? NONE,
      owner_id: deal?.owner_id ?? NONE,
      close_date: deal?.close_date ?? "",
    });
  }, [open, deal, defaultStageId, defaultContactId, defaultTitle]);

  // Ao criar sem etapa escolhida, cai na primeira do pipeline.
  useEffect(() => {
    if (!open || isEdit) return;
    if (form.stage_id === NONE && stages && stages.length > 0) {
      setForm((f) => ({ ...f, stage_id: stages[0].id }));
    }
  }, [open, isEdit, stages, form.stage_id]);

  const isSaving = createDeal.isPending || updateDeal.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error("Informe o título do negócio.");
      return;
    }

    if (exigeEmpresa(modelo) && form.company_id === NONE) {
      toast.error("Neste modelo de negócio (B2B) todo negócio precisa de uma empresa.");
      return;
    }
    const stageId = form.stage_id === NONE ? null : form.stage_id;
    // A probabilidade acompanha a etapa escolhida.
    const stage = stages?.find((s) => s.id === stageId);

    const payload = {
      title: form.title.trim(),
      value: form.value.trim() ? Number(form.value) : 0,
      stage_id: stageId,
      contact_id: form.contact_id === NONE ? null : form.contact_id,
      company_id: form.company_id === NONE ? null : form.company_id,
      owner_id: form.owner_id === NONE ? null : form.owner_id,
      close_date: form.close_date || null,
      ...(stage ? { probability: stage.win_probability } : {}),
    };

    try {
      if (isEdit && deal) {
        await updateDeal.mutateAsync({ id: deal.id, ...payload });
        toast.success("Negócio atualizado.");
      } else {
        await createDeal.mutateAsync(payload);
        toast.success("Negócio criado.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível salvar: ${error.message}`
          : "Não foi possível salvar o negócio. Tente novamente.",
      );
    }
  };

  const contactLabel = (c: { first_name: string; last_name: string | null }) =>
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(sem nome)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="deal-dialog">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar negócio" : "Novo negócio"}</DialogTitle>
            <DialogDescription>
              O valor pode vir dos produtos vinculados na página do negócio — aqui é uma estimativa inicial.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Valor (R$)</Label>
              <Input
                id="value"
                type="number"
                min="0"
                step="0.01"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="close_date">Previsão de fechamento</Label>
              <Input
                id="close_date"
                type="date"
                value={form.close_date}
                onChange={(e) => setForm({ ...form, close_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage">Etapa</Label>
              <Select
                value={form.stage_id}
                onValueChange={(value) => setForm({ ...form, stage_id: value })}
              >
                <SelectTrigger id="stage">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  {(stages ?? []).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">Owner</Label>
              <Select
                value={form.owner_id}
                onValueChange={(value) => setForm({ ...form, owner_id: value })}
              >
                <SelectTrigger id="owner">
                  <SelectValue placeholder="Sem owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem owner</SelectItem>
                  {(members ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            {!escondeEmpresa(modelo) && (
<div className="space-y-2">
              <Label htmlFor="company">Empresa{exigeEmpresa(modelo) ? " (obrigatória)" : ""}</Label>
              <Select
                value={form.company_id}
                onValueChange={(value) => setForm({ ...form, company_id: value })}
              >
                <SelectTrigger id="company">
                  <SelectValue placeholder="Sem empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem empresa</SelectItem>
                  {(companies ?? []).map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
)}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} data-testid="deal-submit">
              {isSaving ? "Salvando…" : isEdit ? "Salvar" : "Criar negócio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
