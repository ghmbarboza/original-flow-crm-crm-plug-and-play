import { useState } from "react";
import { toast } from "sonner";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useActiveProducts } from "@/hooks/useProducts";
import {
  useAddDealProduct, useDealProducts, useRemoveDealProduct, useUpdateDealProduct,
} from "@/hooks/useDealProducts";
import { formatCurrency } from "@/lib/format";

export function DealProductsSection({ dealId, currency }: { dealId: string; currency: string }) {
  const { data: items, isLoading } = useDealProducts(dealId);
  const { data: products } = useActiveProducts();
  const addProduct = useAddDealProduct();
  const updateProduct = useUpdateDealProduct();
  const removeProduct = useRemoveDealProduct();

  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState("1");

  const total = (items ?? []).reduce((sum, item) => sum + Number(item.total_price ?? 0), 0);

  const handleAdd = async () => {
    const product = products?.find((p) => p.id === selectedProduct);
    if (!product) {
      toast.error("Escolha um produto.");
      return;
    }
    const qty = Number(quantity) || 1;
    try {
      await addProduct.mutateAsync({
        dealId,
        productId: product.id,
        quantity: qty,
        unitPrice: Number(product.price ?? 0),
      });
      setSelectedProduct("");
      setQuantity("1");
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível adicionar: ${error.message}` : "Não foi possível adicionar o produto.",
      );
    }
  };

  const handleQuantity = async (id: string, value: string) => {
    const qty = Math.max(1, Number(value) || 1);
    try {
      await updateProduct.mutateAsync({ id, dealId, quantity: qty });
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível atualizar: ${error.message}` : "Não foi possível atualizar a quantidade.",
      );
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeProduct.mutateAsync({ id, dealId });
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível remover: ${error.message}` : "Não foi possível remover o produto.",
      );
    }
  };

  return (
    <div className="via-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Package className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
          Produtos
        </h2>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1">
          <label className="text-xs" style={{ color: "var(--via-text-muted)" }}>Produto</label>
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger data-testid="deal-product-select">
              <SelectValue placeholder="Selecione um produto" />
            </SelectTrigger>
            <SelectContent>
              {(products ?? []).length === 0 ? (
                <div className="px-2 py-1.5 text-sm" style={{ color: "var(--via-text-muted)" }}>
                  Nenhum produto ativo. Cadastre em Produtos.
                </div>
              ) : (
                (products ?? []).map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} · {formatCurrency(product.price, product.currency)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24 space-y-1">
          <label className="text-xs" style={{ color: "var(--via-text-muted)" }}>Qtd</label>
          <Input
            type="number"
            min="1"
            data-testid="deal-product-qty"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <Button onClick={handleAdd} disabled={addProduct.isPending || !selectedProduct} className="gap-1.5" data-testid="deal-product-add">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Adicionar
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (items ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nenhum produto vinculado. O valor do negócio soma automaticamente os produtos adicionados aqui.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="w-24">Qtd</TableHead>
                <TableHead className="text-right">Unitário</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product?.name ?? "(produto removido)"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      defaultValue={item.quantity}
                      className="h-8 w-20"
                      onBlur={(e) => {
                        if (Number(e.target.value) !== item.quantity) handleQuantity(item.id, e.target.value);
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.unit_price, item.product?.currency ?? currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.total_price, item.product?.currency ?? currency)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(item.id)}
                      aria-label={`Remover ${item.product?.name ?? "produto"}`}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-medium">Total</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrency(total, currency)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
