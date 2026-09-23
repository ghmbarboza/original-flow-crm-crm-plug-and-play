import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BILLING_LABELS, BILLING_SUFIXO, KIND_LABELS, type ProductBilling, type ProductKind } from "@/lib/produtos";
import { useCreateProduct, useUpdateProduct, type Product } from "@/hooks/useProducts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, edita. */
  product?: Product | null;
}

export function ProductFormDialog({ open, onOpenChange, product }: Props) {
  const isEdit = !!product;
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    is_active: true,
    track_stock: false,
    stock_quantity: "",
    stock_minimum_alert: "",
    kind: "product" as ProductKind,
    billing: "one_time" as ProductBilling,
    unit: "",
    duration_minutes: "",
    setup_fee: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      kind: ((product?.kind as ProductKind | undefined) ?? "product"),
      billing: ((product?.billing as ProductBilling | undefined) ?? "one_time"),
      unit: product?.unit ?? "",
      duration_minutes: product?.duration_minutes !== null && product?.duration_minutes !== undefined ? String(product.duration_minutes) : "",
      setup_fee: product?.setup_fee ? String(product.setup_fee) : "",
      name: product?.name ?? "",
      description: product?.description ?? "",
      price: product ? String(product.price ?? "") : "",
      is_active: product?.is_active ?? true,
      track_stock: product?.track_stock ?? false,
      stock_quantity: product?.stock_quantity !== null && product?.stock_quantity !== undefined ? String(product.stock_quantity) : "",
      stock_minimum_alert: product?.stock_minimum_alert !== null && product?.stock_minimum_alert !== undefined ? String(product.stock_minimum_alert) : "",
    });
  }, [open, product]);

  const isSaving = createProduct.isPending || updateProduct.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Informe o nome do item.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: form.price.trim() ? Number(form.price) : 0,
      is_active: form.is_active,
      kind: form.kind,
      billing: form.billing,
      unit: form.unit.trim() || null,
      duration_minutes: form.kind !== "product" && form.duration_minutes.trim() ? Math.max(0, Number(form.duration_minutes)) : null,
      setup_fee: form.setup_fee.trim() ? Math.max(0, Number(form.setup_fee)) : 0,
      track_stock: form.kind === "product" && form.track_stock,
      stock_quantity: form.track_stock && form.stock_quantity.trim() !== "" ? Math.max(0, Number(form.stock_quantity)) : null,
      stock_minimum_alert: form.track_stock && form.stock_minimum_alert.trim() !== "" ? Math.max(0, Number(form.stock_minimum_alert)) : null,
    };

    try {
      if (isEdit && product) {
        await updateProduct.mutateAsync({ id: product.id, ...payload });
        toast.success("Produto atualizado.");
      } else {
        await createProduct.mutateAsync(payload);
        toast.success("Produto criado.");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Não foi possível salvar: ${error.message}`
          : "Não foi possível salvar o produto. Tente novamente.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="product-dialog">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar produto" : "Novo produto"}</DialogTitle>
            <DialogDescription>
              O preço vira o valor unitário sugerido ao adicionar o produto a um negócio.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as ProductKind, ...(v === "subscription" && form.billing === "one_time" ? { billing: "monthly" as ProductBilling } : {}) })}>
                  <SelectTrigger aria-label="Tipo do item" data-testid="product-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABELS) as ProductKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cobrança</Label>
                <Select value={form.billing} onValueChange={(v) => setForm({ ...form, billing: v as ProductBilling })}>
                  <SelectTrigger aria-label="Forma de cobrança" data-testid="product-billing"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BILLING_LABELS) as ProductBilling[]).map((b) => <SelectItem key={b} value={b}>{BILLING_LABELS[b]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Preço (R$){BILLING_SUFIXO[form.billing] ? ` ${BILLING_SUFIXO[form.billing]}` : ""}</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="unit">Unidade</Label>
                <Input id="unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={form.kind === "product" ? "un, kg, caixa" : form.billing === "hourly" ? "hora" : "sessão, mês, pacote"} />
              </div>
              {form.kind !== "product" && (
                <div className="space-y-2">
                  <Label htmlFor="duration_minutes">Duração (min)</Label>
                  <Input id="duration_minutes" type="number" min="0" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} placeholder="60" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="setup_fee">Taxa de adesão (R$)</Label>
                <Input id="setup_fee" type="number" min="0" step="0.01" value={form.setup_fee} onChange={(e) => setForm({ ...form, setup_fee: e.target.value })} placeholder="0" />
              </div>
            </div>
            {/* Controle de estoque (Parte 7 do Sprint 10B). Só faz sentido para produto físico. */}
            {form.kind === "product" && (
            <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--via-border)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="track_stock">Controlar estoque</Label>
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                    Deal ganho baixa o estoque; reabrir ou perder depois recompõe. Sem controle,
                    o produto é ilimitado (serviços).
                  </p>
                </div>
                <Switch
                  id="track_stock"
                  checked={form.track_stock}
                  onCheckedChange={(checked) => setForm({ ...form, track_stock: checked })}
                  data-testid="product-track-stock"
                />
              </div>
              {form.track_stock && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="stock_quantity">Quantidade em estoque</Label>
                    <Input
                      id="stock_quantity"
                      type="number"
                      min="0"
                      value={form.stock_quantity}
                      onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                      data-testid="product-stock-quantity"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="stock_minimum_alert">Alertar abaixo de</Label>
                    <Input
                      id="stock_minimum_alert"
                      type="number"
                      min="0"
                      value={form.stock_minimum_alert}
                      onChange={(e) => setForm({ ...form, stock_minimum_alert: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3" style={{ borderColor: "var(--via-border)" }}>
              <div>
                <Label htmlFor="is_active">Item ativo</Label>
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Só produtos ativos aparecem no seletor de negócios.
                </p>
              </div>
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving} data-testid="product-submit">
              {isSaving ? "Salvando…" : isEdit ? "Salvar" : "Criar produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
