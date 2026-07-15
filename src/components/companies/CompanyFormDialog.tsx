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
import { useCreateCompany, useUpdateCompany, type Company } from "@/hooks/useCompanies";
import { useOrgMembers } from "@/hooks/useOrgMembers";

const NO_OWNER = "__none__";

/** Faixas de tamanho no padrão de mercado — mantém o filtro e os relatórios comparáveis. */
const SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, o diálogo edita em vez de criar. */
  company?: Company | null;
}

export function CompanyFormDialog({ open, onOpenChange, company }: Props) {
  const isEdit = !!company;
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const { data: members } = useOrgMembers();

  const [form, setForm] = useState({
    name: "",
    domain: "",
    website: "",
    industry: "",
    size: "",
    owner_id: NO_OWNER,
  });

  // Recarrega o formulário sempre que o diálogo abre, para não vazar o estado da edição anterior.
  useEffect(() => {
    if (!open) return;
    setForm({
      name: company?.name ?? "",
      domain: company?.domain ?? "",
      website: company?.website ?? "",
      industry: company?.industry ?? "",
      size: company?.size ?? "",
      owner_id: company?.owner_id ?? NO_OWNER,
    });
  }, [open, company]);

  const isSaving = createCompany.isPending || updateCompany.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Informe o nome da empresa.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      domain: form.domain.trim() || null,
      website: form.website.trim() || null,
      industry: form.industry.trim() || null,
      size: form.size || null,
      owner_id: form.owner_id === NO_OWNER ? null : form.owner_id,
    };

    try {
      if (isEdit && company) {
        await updateCompany.mutateAsync({ id: company.id, ...payload });
        toast.success("Empresa atualizada.");
      } else {
        await createCompany.mutateAsync(payload);
        toast.success("Empresa criada.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível salvar: ${error.message}`
          : "Não foi possível salvar a empresa. Tente novamente.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar empresa" : "Nova empresa"}</DialogTitle>
            <DialogDescription>
              Só o nome é obrigatório. O domínio ajuda a reconhecer a empresa ao importar contatos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain">Domínio</Label>
              <Input
                id="domain"
                placeholder="empresa.com.br"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Site</Label>
              <Input
                id="website"
                placeholder="https://empresa.com.br"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Setor</Label>
              <Input
                id="industry"
                placeholder="Tecnologia, varejo, saúde…"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">Tamanho</Label>
              <Select
                value={form.size}
                onValueChange={(value) => setForm({ ...form, size: value })}
              >
                <SelectTrigger id="size">
                  <SelectValue placeholder="Funcionários" />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size} funcionários
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="owner">Owner</Label>
              <Select
                value={form.owner_id}
                onValueChange={(value) => setForm({ ...form, owner_id: value })}
              >
                <SelectTrigger id="owner">
                  <SelectValue placeholder="Sem owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_OWNER}>Sem owner</SelectItem>
                  {(members ?? []).map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Salvando…" : isEdit ? "Salvar" : "Criar empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
