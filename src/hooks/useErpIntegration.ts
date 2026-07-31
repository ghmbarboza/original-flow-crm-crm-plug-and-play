import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ErpConfig = Database["public"]["Tables"]["erp_integration_configs"]["Row"];
export type ErpLog = Database["public"]["Tables"]["erp_webhook_logs"]["Row"];

/** Eventos de SAÍDA que os triggers de banco produzem (Parte 2 do Sprint 10B). */
export const ERP_OUTBOUND_EVENTS = [
  { value: "deal_ganho", label: "Deal ganho (valor, produtos, contato)" },
  { value: "deal_perdido", label: "Deal perdido (motivo)" },
  { value: "novo_contato", label: "Novo contato criado" },
  { value: "contato_atualizado", label: "Contato atualizado" },
  { value: "nova_atividade", label: "Nova atividade criada" },
] as const;

/** Campos canônicos disponíveis para mapeamento, por evento de saída. */
export const ERP_CANONICAL_FIELDS: Record<string, string[]> = {
  deal_ganho: [
    "deal.id", "deal.title", "deal.value", "deal.currency", "deal.close_date",
    "deal.products", "contact.name", "contact.email", "contact.phone", "company.name",
  ],
  deal_perdido: [
    "deal.id", "deal.title", "deal.value", "deal.currency", "deal.loss_reason",
    "contact.name", "contact.email", "contact.phone", "company.name",
  ],
  novo_contato: ["contact.id", "contact.name", "contact.email", "contact.phone", "contact.status"],
  contato_atualizado: ["contact.id", "contact.name", "contact.email", "contact.phone", "contact.status"],
  nova_atividade: [
    "activity.id", "activity.type", "activity.title", "activity.due_date",
    "activity.contact_id", "activity.deal_id",
  ],
};

/** Eventos de ENTRADA que o erp-webhook sabe executar, com exemplo de payload. */
export const ERP_INBOUND_EVENTS = [
  {
    value: "pedido_faturado",
    label: "pedido_faturado → Marcar deal como Ganho",
    example: `{
  "event": "pedido_faturado",
  "pedido_id": "PED-001",
  "cliente_email": "joao@email.com",
  "valor": 15000.00,
  "data": "2026-07-29"
}`,
  },
  {
    value: "estoque_atualizado",
    label: "estoque_atualizado → Atualizar produto no catálogo",
    example: `{
  "event": "estoque_atualizado",
  "produto_nome": "Consultoria Estratégica",
  "quantidade": 8
}`,
  },
  {
    value: "cliente_inadimplente",
    label: 'cliente_inadimplente → Adicionar tag "Inadimplente"',
    example: `{
  "event": "cliente_inadimplente",
  "cliente_email": "joao@email.com"
}`,
  },
  {
    value: "nova_oportunidade",
    label: "nova_oportunidade → Criar deal no pipeline",
    example: `{
  "event": "nova_oportunidade",
  "titulo": "Renovação anual",
  "valor": 24000.00,
  "cliente_email": "joao@email.com"
}`,
  },
] as const;

export function useErpConfig() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["erp-config", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ErpConfig | null> => {
      const { data, error } = await supabase
        .from("erp_integration_configs")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useSaveErpConfig() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<Omit<ErpConfig, "id" | "org_id" | "created_at">>) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase.from("erp_integration_configs").upsert(
        { org_id: orgId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "org_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["erp-config", orgId] }),
  });
}

/** Gera um novo token de entrada — o anterior deixa de funcionar na hora. */
export function useRegenerateErpToken() {
  const save = useSaveErpConfig();
  return useMutation({
    mutationFn: async () => {
      const token = `sk_erp_${crypto.randomUUID().replace(/-/g, "")}`;
      await save.mutateAsync({ inbound_token: token });
      return token;
    },
  });
}

export function useErpLogs() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["erp-logs", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ErpLog[]> => {
      const { data, error } = await supabase
        .from("erp_webhook_logs")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Botão "Testar": pede à erp-outbound um envio imediato de payload de teste. */
export function useTestErpConnection() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("erp-outbound", {
        body: { test: true },
      });
      if (error) throw await erroDeFunction(error, "Não foi possível testar a conexão.");
      if (data?.error) throw new Error(data.error);
    },
  });
}
