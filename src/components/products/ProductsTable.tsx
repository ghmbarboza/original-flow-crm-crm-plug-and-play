import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Package, Pencil, Trash2 } from "lucide-react";
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
import { useDeleteProduct, useProductMetrics, type Product } from "@/hooks/useProducts";
import { formatCurrency } from "@/lib/format";
import { BILLING_SUFIXO, KIND_LABELS, type ProductBilling, type ProductKind } from "@/lib/produtos";

/** Célula de estoque: ilimitado, disponível ou destaque quando abaixo do mínimo. */
function StockCell({ product }: { product: Product }) {
  if (!product.track_stock || product.stock_quantity === null) {
    return <span style={{ color: "var(--via-text-muted)" }}>Ilimitado</span>;
  }
  const low = product.stock_minimum_alert !== null && product.stock_quantity < product.stock_minimum_alert;
  return (
    <span
      className="tabular-nums"
      style={{ color: low ? "var(--via-coral)" : "var(--via-text-primary)", fontWeight: low ? 600 : undefined }}
      title={low ? `Abaixo do mínimo (${product.stock_minimum_alert})` : undefined}
    >
      {product.stock_quantity} {low ? "⚠" : ""}
    </span>
  );
}

interface Props {
  products: Product[];
  isLoading: boolean;
  isFiltered: boolean;
  onEdit: (product: Product) => void;
  onCreate: () => void;
}

export function ProductsTable({ products, isLoading, isFiltered, onEdit, onCreate }: Props) {
  const deleteProduct = useDeleteProduct();
  const { data: metrics } = useProductMetrics();
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteProduct.mutateAsync(pendingDelete.id);
      toast.success("Produto excluído.");
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível excluir: ${error.message}` : "Não foi possível excluir o produto.",
      );
    } finally {
      setPendingDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="via-card p-10 text-center">
        <Package className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        {isFiltered ? (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nenhum produto corresponde à busca
            </p>
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Ajuste a busca para ver outros produtos.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nenhum produto ainda
            </p>
            <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
              Cadastre produtos, serviços e assinaturas para vincular a negócios e calcular o valor automaticamente.
            </p>
            <Button onClick={onCreate}>Criar primeiro produto</Button>
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
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Estoque</TableHead>
              <TableHead className="text-right">Em negociação</TableHead>
              <TableHead className="text-right">Vendidos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id} className="cursor-pointer" onClick={() => onEdit(product)}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell style={{ color: "var(--via-text-body)" }} data-testid="product-kind-cell">
                  {KIND_LABELS[(product.kind as ProductKind) ?? "product"]}
                </TableCell>
                <TableCell className="max-w-md truncate" style={{ color: "var(--via-text-body)" }}>
                  {product.description ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(product.price, product.currency)}{BILLING_SUFIXO[(product.billing as ProductBilling) ?? "one_time"]}
                </TableCell>
                <TableCell className="text-right" data-testid="product-stock">
                  {(product.kind ?? "product") === "product" ? <StockCell product={product} /> : <span style={{ color: "var(--via-text-muted)" }}>—</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums" style={{ color: "var(--via-text-body)" }}>
                  {metrics?.get(product.id)?.deals_in_progress ?? 0}
                </TableCell>
                <TableCell className="text-right tabular-nums" style={{ color: "var(--via-text-body)" }}>
                  {metrics?.get(product.id)?.deals_won ?? 0}
                </TableCell>
                <TableCell>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={
                      product.is_active
                        ? { background: "var(--via-success)", color: "var(--via-white)" }
                        : { background: "var(--via-surface)", color: "var(--via-text-muted)" }
                    }
                  >
                    {product.is_active ? "Ativo" : "Inativo"}
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Ações para ${product.name}`}>
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(product)}>
                        <Pencil className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPendingDelete(product)}>
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
            <AlertDialogTitle>Excluir este produto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto sai do catálogo permanentemente. Um produto já vinculado a algum negócio não
              pode ser excluído — nesse caso, desative-o para tirá-lo do seletor sem perder o histórico.
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
