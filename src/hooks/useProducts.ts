import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

export function useProducts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["products", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Só os produtos ativos — usado no seletor de produtos do deal. */
export function useActiveProducts() {
  const { data, ...rest } = useProducts();
  return { data: (data ?? []).filter((p) => p.is_active), ...rest };
}

export function useCreateProduct() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<ProductInsert, "org_id">) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data, error } = await supabase
        .from("products")
        .insert({ ...input, org_id: orgId })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products", orgId] }),
  });
}

export function useUpdateProduct() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<ProductInsert>) => {
      const { error } = await supabase
        .from("products")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products", orgId] }),
  });
}

export function useDeleteProduct() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        // FK ON DELETE RESTRICT: o produto está vinculado a algum negócio.
        if (error.code === "23503") {
          throw new Error("Este produto está vinculado a um ou mais negócios. Desative-o em vez de excluir.");
        }
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products", orgId] }),
  });
}

/** Importação CSV: insere em lote e devolve quantos entraram. */
export function useImportProducts() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: Omit<ProductInsert, "org_id">[]) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      if (rows.length === 0) return { inserted: 0 };
      const { data, error } = await supabase
        .from("products")
        .insert(rows.map((r) => ({ ...r, org_id: orgId })))
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products", orgId] }),
  });
}
