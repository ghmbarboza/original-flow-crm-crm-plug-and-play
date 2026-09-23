import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import type { Database } from "@/integrations/supabase/types";

/**
 * Conectores com outros CRMs (Sprint 12 B9). O token nunca chega ao front:
 * vai direto para a function crm-connect, que guarda no Vault. Aqui só se lê
 * a conexão (provedor, conta, estrutura) e se disparam as ações.
 */

export type CrmProvider = "hubspot" | "pipedrive" | "rdstation" | "agendor" | "kommo" | "salesforce";
export type CrmEntity = "contacts" | "companies" | "deals";
export type CrmConnection = Database["public"]["Tables"]["crm_connections"]["Row"];

export interface CrmStage { id: string; name: string; pipeline: string; order: number; won?: boolean; lost?: boolean }
export interface CrmStructure {
  account?: string | null;
  pipelines: { id: string; name: string; stages: CrmStage[] }[];
  fields: Partial<Record<CrmEntity, { key: string; label: string; custom?: boolean }[]>>;
  counts: Partial<Record<CrmEntity, number | null>>;
  users: { id: string; email: string; name?: string }[];
}

export interface CrmProviderInfo {
  id: CrmProvider;
  label: string;
  auth: "token" | "oauth";
  /** Pede o subdomínio da conta (Pipedrive, Kommo). */
  domain?: { label: string; suffix: string };
  tokenLabel: string;
  help: string;
}

export const CRM_PROVIDERS: CrmProviderInfo[] = [
  { id: "hubspot", label: "HubSpot", auth: "token", tokenLabel: "Token do app privado", help: "HubSpot > Configurações > Integrações > Apps privados > Criar app com os escopos crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read, crm.objects.owners.read e crm.schemas.*.read." },
  { id: "pipedrive", label: "Pipedrive", auth: "token", domain: { label: "Subdomínio da conta", suffix: ".pipedrive.com" }, tokenLabel: "Token pessoal da API", help: "Pipedrive > Configurações pessoais > API > Token pessoal." },
  { id: "rdstation", label: "RD Station CRM", auth: "token", tokenLabel: "Token da instância", help: "RD Station CRM > Perfil > Token da instância (Configurações > Integrações)." },
  { id: "agendor", label: "Agendor", auth: "token", tokenLabel: "Token da API", help: "Agendor > Configurações > Integrações > Token de API." },
  { id: "kommo", label: "Kommo", auth: "token", domain: { label: "Subdomínio da conta", suffix: ".kommo.com" }, tokenLabel: "Token de longa duração", help: "Kommo > Configurações > Integrações > sua integração > Token de longa duração." },
  { id: "salesforce", label: "Salesforce", auth: "oauth", tokenLabel: "", help: "Cadastre o Consumer Key e o Consumer Secret de um Connected App (OAuth, escopos api e refresh_token) e autorize a conta." },
];

export const CRM_ENTITY_LABEL: Record<CrmEntity, string> = { companies: "Empresas", contacts: "Contatos", deals: "Negócios" };
/** Ordem que mantém os vínculos: empresa antes de contato, contato antes de negócio. */
export const CRM_SYNC_ORDER: CrmEntity[] = ["companies", "contacts", "deals"];

export function useCrmConnections() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["crm-connections", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CrmConnection[]> => {
      const { data, error } = await supabase.from("crm_connections").select("*").eq("org_id", orgId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

async function chamar<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("crm-connect", { body });
  if (error) throw await erroDeFunction(error, "Falha ao falar com o CRM de origem.");
  if (data?.error) throw new Error(data.error);
  return data as T;
}

function useInvalidar() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return (tudo = false) => {
    queryClient.invalidateQueries({ queryKey: ["crm-connections", orgId] });
    if (tudo) for (const key of ["imports", "contacts", "companies", "deals"]) queryClient.invalidateQueries({ queryKey: [key, orgId] });
  };
}

export function useConnectCrm() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (input: { provider: CrmProvider; token: string; domain?: string; label?: string }) =>
      chamar<{ connection: CrmConnection }>({ action: "connect", ...input }),
    onSuccess: () => invalidar(),
  });
}

export function useStartCrmOAuth() {
  return useMutation({
    mutationFn: async (provider: CrmProvider) => {
      const r = await chamar<{ url: string }>({ action: "oauth_start", provider, app_origin: window.location.origin });
      return r.url;
    },
  });
}

export function useRefreshCrmStructure() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (connectionId: string) => chamar<{ structure: CrmStructure }>({ action: "structure", connection_id: connectionId }),
    onSuccess: () => invalidar(),
  });
}

export function useDisconnectCrm() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (connectionId: string) => chamar({ action: "disconnect", connection_id: connectionId }),
    onSuccess: () => invalidar(),
  });
}

export interface ResultadoSync {
  kind: CrmEntity;
  total: number;
  created: number;
  updated: number;
  error: number;
  importId: string;
}

interface RespostaSync {
  import_id: string; next_cursor: string | null; row_offset: number; done: boolean;
  total: number; created: number; updated: number; error: number;
}

/** Sincroniza uma entidade página a página até a function dizer que acabou. */
export function useSyncCrm() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: { connectionId: string; kind: CrmEntity; stageMap: Record<string, string>; onProgresso?: (linhas: number) => void }): Promise<ResultadoSync> => {
      let cursor: string | null = null;
      let importId = "";
      let offset = 0;
      let ultima: RespostaSync | null = null;
      do {
        ultima = await chamar<RespostaSync>({
          action: "sync", connection_id: input.connectionId, kind: input.kind, stage_map: input.stageMap,
          ...(importId ? { import_id: importId, cursor, row_offset: offset } : {}),
        });
        importId = ultima.import_id;
        cursor = ultima.next_cursor;
        offset = ultima.row_offset;
        input.onProgresso?.(ultima.total);
      } while (!ultima.done);
      return { kind: input.kind, total: ultima.total, created: ultima.created, updated: ultima.updated, error: ultima.error, importId };
    },
    onSuccess: () => invalidar(true),
  });
}
