import { useMemo, useState } from "react";
import { Package, Plus, Search, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { ProductsTable } from "@/components/products/ProductsTable";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { ProductImportDialog } from "@/components/products/ProductImportDialog";
import { useProducts, type Product } from "@/hooks/useProducts";

const ALL = "__all__";

export default function ProductsPage() {
  const { data: products, isLoading, error } = useProducts();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products ?? []).filter((product) => {
      if (statusFilter === "active" && !product.is_active) return false;
      if (statusFilter === "inactive" && product.is_active) return false;
      if (!term) return true;
      const haystack = [product.name, product.description].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [products, search, statusFilter]);

  const isFiltered = search.trim() !== "" || statusFilter !== ALL;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setFormOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Package className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Produtos
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
              <Upload className="h-4 w-4" strokeWidth={1.5} />
              Importar
            </Button>
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Novo produto
            </Button>
          </div>
        </div>

        {error && (
          <ErrorState
            title="Não foi possível carregar os produtos"
            message={
              <>
                {error instanceof Error ? error.message : "Erro desconhecido."} Recarregue a página.
              </>
            }
          />
        )}

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-64 flex-1">
            <Search
              className="absolute left-2.5 top-2.5 h-4 w-4"
              strokeWidth={1.5}
              style={{ color: "var(--via-text-muted)" }}
            />
            <Input
              className="pl-8"
              placeholder="Buscar por nome ou descrição"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ProductsTable
          products={filtered}
          isLoading={isLoading}
          isFiltered={isFiltered}
          onEdit={openEdit}
          onCreate={openCreate}
        />
      </div>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
      <ProductImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppShell>
  );
}
