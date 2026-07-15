import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { DealStatusBadge } from "@/components/deals/DealStatusBadge";
import { useDeleteDeal, contactName, type Deal } from "@/hooks/useDeals";
import { useOrgMemberNames } from "@/hooks/useOrgMembers";
import { formatCurrency, formatDate } from "@/lib/format";

interface Props {
  deals: Deal[];
  isLoading: boolean;
  isFiltered: boolean;
  onSelect: (deal: Deal) => void;
  onEdit: (deal: Deal) => void;
  onCreate: () => void;
}

export function DealsList({ deals, isLoading, isFiltered, onSelect, onEdit, onCreate }: Props) {
  const navigate = useNavigate();
  const deleteDeal = useDeleteDeal();
  const ownerNames = useOrgMemberNames();
  const [pendingDelete, setPendingDelete] = useState<Deal | null>(null);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteDeal.mutateAsync(pendingDelete.id);
      toast.success("Negócio excluído.");
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível excluir: ${error.message}` : "Não foi possível excluir o negócio.",
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
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="via-card p-10 text-center">
        <TrendingUp className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        {isFiltered ? (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nenhum negócio corresponde ao filtro
            </p>
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Ajuste os filtros para ver outros negócios.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nenhum negócio ainda
            </p>
            <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
              Crie o primeiro negócio para começar a acompanhar o funil de vendas.
            </p>
            <Button onClick={onCreate}>Criar primeiro negócio</Button>
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
              <TableHead>Título</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fechamento</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((deal) => (
              <TableRow key={deal.id} className="cursor-pointer" onClick={() => onSelect(deal)}>
                <TableCell className="font-medium">{deal.title}</TableCell>
                <TableCell>
                  {deal.stage ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: deal.stage.color }}
                        aria-hidden
                      />
                      {deal.stage.name}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(deal.value, deal.currency)}
                </TableCell>
                <TableCell>{contactName(deal.contact) ?? "—"}</TableCell>
                <TableCell>{deal.company?.name ?? "—"}</TableCell>
                <TableCell>{deal.owner_id ? ownerNames.get(deal.owner_id) ?? "—" : "—"}</TableCell>
                <TableCell>
                  <DealStatusBadge status={deal.status} />
                </TableCell>
                <TableCell style={{ color: "var(--via-text-muted)" }}>
                  {formatDate(deal.close_date)}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Ações para ${deal.title}`}>
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/deals/${deal.id}`)}>
                        <TrendingUp className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        Abrir
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(deal)}>
                        <Pencil className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPendingDelete(deal)}>
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
            <AlertDialogTitle>Excluir este negócio?</AlertDialogTitle>
            <AlertDialogDescription>
              O negócio sai da lista permanentemente, junto com seus produtos vinculados. As atividades
              e emails ligados a ele deixam de apontar para o negócio, mas não são apagados.
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
