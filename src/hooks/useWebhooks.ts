import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

/**
 * Módulo Webhooks (Sprint 11): destinos de saída, chaves de entrada e os logs dos
 * dois sentidos. Contrato completo em WEBHOOKS.md; backend em webhook-dispatcher,
 * webhook-inbound e na migration 20260914120000.
 */

export type WebhookEndpoint = Database["public"]["Tables"]["webhook_endpoints"]["Row"];
export type WebhookDelivery = Database["public"]["Tables"]["webhook_deliveries"]["Row"];
export type WebhookInboundKey = Database["public"]["Tables"]["webhook_inbound_keys"]["Row"];
export type WebhookInboundLog = Database["public"]["Tables"]["webhook_inbound_logs"]["Row"];

/** Eventos que os triggers de banco produzem. `*` assina todos. */
export const WEBHOOK_EVENTOS_SAIDA = [
  { value: "contact.created", label: "Contato criado" },
  { value: "contact.updated", label: "Contato atualizado" },
  { value: "deal.created", label: "Negócio criado" },
  { value: "deal.stage_changed", label: "Negócio mudou de etapa" },
  { value: "deal.won", label: "Negócio ganho" },
  { value: "deal.lost", label: "Negócio perdido" },
  { value: "activity.created", label: "Atividade criada" },
  { value: "message.received", label: "Mensagem recebida" },
  { value: "message.sent", label: "Mensagem enviada (equipe, IA ou API)" },
  { value: "conversation.started", label: "Conversa iniciada" },
  { value: "conversation.handoff", label: "Conversa transferida para humano" },
  { value: "deal.assigned", label: "Negócio atribuído" },
  { value: "nps.submitted", label: "NPS respondido" },
] as const;

/** Ações e eventos que o webhook-inbound entende, com exemplo para quem integra. */
export const WEBHOOK_ACOES_ENTRADA = [
  {
    value: "lead.created",
    label: "Lead novo: cria (ou completa) o contato e abre um negócio",
    example: `{
  "event": "lead.created",
  "data": { "name": "Maria Souza", "email": "maria@empresa.com", "phone": "11999998888", "company": "Empresa X" }
}`,
  },
  {
    value: "contact.upsert",
    label: "Cria ou atualiza um contato (por e-mail ou telefone)",
    example: `{
  "action": "contact.upsert",
  "data": { "email": "maria@empresa.com", "first_name": "Maria", "tags": ["Cliente"] }
}`,
  },
  {
    value: "deal.update",
    label: "Atualiza o negócio aberto do contato (etapa, valor, status)",
    example: `{
  "action": "deal.update",
  "data": { "contact": { "email": "maria@empresa.com" }, "stage": "Proposta", "value": 4500 }
}`,
  },
  {
    value: "contract.signed",
    label: "Contrato assinado: registra nota e marca o negócio como ganho",
    example: `{
  "event": "contract.signed",
  "data": { "document": { "title": "Contrato 2026" }, "signer": { "email": "maria@empresa.com" } }
}`,
  },
  {
    value: "payment.confirmed",
    label: "Pagamento confirmado: nota com o valor e negócio ganho",
    example: `{
  "event": "payment.confirmed",
  "data": { "amount": 1250.9, "customer": { "email": "maria@empresa.com" } }
}`,
  },
  {
    value: "appointment.scheduled",
    label: "Reunião agendada: cria a atividade ligada ao negócio",
    example: `{
  "event": "appointment.scheduled",
  "data": { "title": "Demo", "start_time": "2026-09-20T14:00:00-03:00", "contact": { "email": "maria@empresa.com" } }
}`,
  },
  {
    value: "nps.submitted",
    label: "NPS ou feedback: nota com a resposta e tag Detrator/Promotor",
    example: `{
  "event": "nps.submitted",
  "data": { "score": 9, "comment": "Atendimento ótimo", "email": "maria@empresa.com" }
}`,
  },
] as const;

export function useWebhookEndpoints() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["webhook-endpoints", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WebhookEndpoint[]> => {
      const { data, error } = await supabase
        .from("webhook_endpoints").select("*").eq("org_id", orgId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Formato do corpo entregue. "painel_preditivo" converte para o que o Painel
 * Preditivo de Metas espera (supabase/functions/_shared/painelPreditivo.ts).
 */
export type WebhookFormato = "flowcrm" | "painel_preditivo";

/** Eventos que o Painel Preditivo usa; espelho de EVENTOS_PAINEL (conferido em teste). */
export const WEBHOOK_EVENTOS_PAINEL = ["deal.created", "deal.stage_changed", "deal.won"];

export interface EndpointInput {
  id?: string;
  name: string;
  url: string;
  events: string[];
  format: WebhookFormato;
  is_active: boolean;
}

export function useSaveWebhookEndpoint() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: EndpointInput) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const url = input.url.trim();
      if (!/^https?:\/\//i.test(url)) throw new Error("A URL precisa começar com https:// (ou http://).");
      if (!input.name.trim()) throw new Error("Dê um nome ao destino (ex.: a solução que vai receber).");
      // Formato do painel só entrega negócios: evento de outro tipo nunca sairia.
      const events = input.format === "painel_preditivo"
        ? input.events.filter((e) => WEBHOOK_EVENTOS_PAINEL.includes(e))
        : input.events;
      if (events.length === 0) throw new Error("Escolha pelo menos um evento.");
      const campos = {
        name: input.name.trim(), url, events, format: input.format,
        is_active: input.is_active, updated_at: new Date().toISOString(),
      };
      const { error } = input.id
        ? await supabase.from("webhook_endpoints").update(campos).eq("id", input.id)
        : await supabase.from("webhook_endpoints").insert({ ...campos, org_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhook-endpoints", orgId] }),
  });
}

export function useDeleteWebhookEndpoint() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhook-endpoints", orgId] }),
  });
}

/** Troca o secret: o destino precisa atualizar a verificação na hora. */
export function useRegenerateWebhookSecret() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const secret = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
      const { error } = await supabase.from("webhook_endpoints").update({ secret, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhook-endpoints", orgId] }),
  });
}

export function useWebhookDeliveries(endpointId: string | null) {
  return useQuery({
    queryKey: ["webhook-deliveries", endpointId],
    enabled: !!endpointId,
    refetchInterval: 15_000,
    queryFn: async (): Promise<WebhookDelivery[]> => {
      const { data, error } = await supabase
        .from("webhook_deliveries").select("*").eq("endpoint_id", endpointId!)
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

async function chamarDispatcher(body: object, padrao: string) {
  const { data, error } = await supabase.functions.invoke("webhook-dispatcher", { body });
  if (error) throw await erroDeFunction(error, padrao);
  if (data?.error) throw new Error(data.error);
  return data as { ok: true; status_code: number };
}

export function useTestWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (endpointId: string) => chamarDispatcher({ action: "test", endpoint_id: endpointId }, "O destino não aceitou o teste."),
    onSettled: (_d, _e, endpointId) => queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", endpointId] }),
  });
}

export function useRedeliverWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (delivery: { id: string; endpoint_id: string }) =>
      chamarDispatcher({ action: "redeliver", delivery_id: delivery.id }, "O reenvio falhou."),
    onSettled: (_d, _e, delivery) => queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", delivery.endpoint_id] }),
  });
}

export function useWebhookInboundKeys() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["webhook-keys", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WebhookInboundKey[]> => {
      const { data, error } = await supabase
        .from("webhook_inbound_keys").select("*").eq("org_id", orgId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Devolve a chave inteira: é a única vez que ela existe fora do banco (lá fica o hash). */
export function useCreateWebhookKey() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<{ id: string; key: string }> => {
      const { data, error } = await supabase.rpc("criar_chave_webhook", { p_name: name });
      if (error) throw error;
      return data as { id: string; key: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhook-keys", orgId] }),
  });
}

export function useSetWebhookKeyActive() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await supabase.from("webhook_inbound_keys").update({ is_active: ativa }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhook-keys", orgId] }),
  });
}

export function useWebhookInboundLogs() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["webhook-inbound-logs", orgId],
    enabled: !!orgId,
    refetchInterval: 15_000,
    queryFn: async (): Promise<WebhookInboundLog[]> => {
      const { data, error } = await supabase
        .from("webhook_inbound_logs").select("*").eq("org_id", orgId!)
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}
