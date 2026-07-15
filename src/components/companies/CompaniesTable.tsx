import { useState } from "react";
import { toast } from "sonner";
import { Building2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteCompany, type Company } from "@/hooks/useCompanies";
import { useOrgMemberNames } from "@/hooks/useOrgMembers";

interface Props {
  companies: Company[];
  isLoading: boolean;
  /** True quando há busca ativa: muda o texto do estado vazio. */
  isFiltered: boolean;
  onSelect: (id: string) => void;
  onEdit: (company: Company) => void;
  onCreate: () => void;
}

export function CompaniesTable({
  companies, isLoading, isFiltered, onSelect, onEdit, onCreate,
}: Props) {
  const deleteCompany = useDeleteCompany();
  const memberNames = useOrgMemberNames();
  const [pendingDelete, setPendingDelete] = useState<Company | null>(null);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteCompany.mutateAsync(pendingDelete.id);
      toast.success("Empresa excluída.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível excluir: ${error.message}`
          : "Não foi possível excluir a empresa.",
      );
    } finally {
      setPendingDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="via-card p-10 text-center">
        <Building2 className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        {isFiltered ? (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nenhuma empresa corresponde à busca
            </p>
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Ajuste o termo buscado para ver outras empresas.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nenhuma empresa ainda
            </p>
            <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
              Empresas agrupam contatos e negócios. Crie a primeira para vincular sua carteira.
            </p>
            <Button onClick={onCreate}>Criar primeira empresa</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="via-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Domínio</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow
                key={company.id}
                className="cursor-pointer"
                onClick={() => onSelect(company.id)}
              >
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell style={{ color: "var(--via-text-body)" }}>
                  {company.domain ?? "—"}
                </TableCell>
                <TableCell>{company.industry ?? "—"}</TableCell>
                <TableCell>{company.size ?? "—"}</TableCell>
                <TableCell>
                  {company.owner_id ? memberNames.get(company.owner_id) ?? "—" : "—"}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Ações para ${company.name}`}>
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(company)}>
                        <Pencil className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPendingDelete(company)}>
                        <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a empresa "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os contatos e negócios da empresa não são apagados — eles apenas deixam de ter
              empresa vinculada, e você pode religá-los a outra depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
