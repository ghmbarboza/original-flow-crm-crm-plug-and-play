import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";

/** Item de produto de um deal, com o produto embutido para exibição. */
export interface DealProduct {
  id: string;
  deal_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  /** Coluna gerada no banco (`quantity * unit_price`). Só leitura. */
  total_price: number | null;
  product: { id: string; name: string; currency: string } | null;
}

export function useDealProducts(dealId: string | null) {
  return useQuery({
    queryKey: ["deal-products", dealId],
    enabled: !!dealId,
    queryFn: async (): Promise<DealProduct[]> => {
      const { data, error } = await supabase
        .from("deal_products")
        .select("id, deal_id, product_id, quantity, unit_price, total_price, product:products(id, name, currency)")
        .eq("deal_id", dealId!);
      if (error) throw error;
      return (data ?? []) as unknown as DealProduct[];
    },
  });
}

/**
 * Recalcula `deals.value` como a soma dos `total_price` dos itens.
 *
 * `deal_products.total_price` é coluna gerada, mas `deals.value` não — ele é o
 * número que aparece no Kanban, no forecast e nos relatórios. Depois de mexer
 * nos produtos, ressincronizamos o valor do deal a partir dos itens.
 */
async function syncDealValue(dealId: string) {
  const { data, error } = await supabase
    .from("deal_products")
    .select("total_price")
    .eq("deal_id", dealId);
  if (error) throw error;
  const value = (data ?? []).reduce((sum, item) => sum + Number(item.total_price ?? 0), 0);
  const { error: updateError } = await supabase
    .from("deals")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("id", dealId);
  if (updateError) throw updateError;
}

interface DealProductsContext {
  dealId: string;
  orgId: string | null;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, { dealId, orgId }: DealProductsContext) {
  queryClient.invalidateQueries({ queryKey: ["deal-products", dealId] });
  queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
  queryClient.invalidateQueries({ queryKey: ["deals", orgId] });
}

export function useAddDealProduct() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      dealId: string;
      productId: string;
      quantity: number;
      unitPrice: number;
    }) => {
      const { error } = await supabase.from("deal_products").insert({
        deal_id: input.dealId,
        product_id: input.productId,
        quantity: input.quantity,
        unit_price: input.unitPrice,
      });
      if (error) throw error;
      await syncDealValue(input.dealId);
    },
    onSuccess: (_data, { dealId }) => invalidate(queryClient, { dealId, orgId }),
  });
}

export function useUpdateDealProduct() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      dealId: string;
      quantity?: number;
      unitPrice?: number;
    }) => {
      const patch: { quantity?: number; unit_price?: number } = {};
      if (input.quantity !== undefined) patch.quantity = input.quantity;
      if (input.unitPrice !== undefined) patch.unit_price = input.unitPrice;
      const { error } = await supabase.from("deal_products").update(patch).eq("id", input.id);
      if (error) throw error;
      await syncDealValue(input.dealId);
    },
    onSuccess: (_data, { dealId }) => invalidate(queryClient, { dealId, orgId }),
  });
}

export function useRemoveDealProduct() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; dealId: string }) => {
      const { error } = await supabase.from("deal_products").delete().eq("id", input.id);
      if (error) throw error;
      await syncDealValue(input.dealId);
    },
    onSuccess: (_data, { dealId }) => invalidate(queryClient, { dealId, orgId }),
  });
}
