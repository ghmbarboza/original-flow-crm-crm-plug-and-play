import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useOrgId } from "@/hooks/useOrgId";
import { podeIniciarConversa, type ContaDeCanal } from "@/hooks/useChannelAccounts";
import type { Database } from "@/integrations/supabase/types";

export type WhatsAppProvider = Database["public"]["Enums"]["messaging_provider"];
export type DistributionMode = Database["public"]["Enums"]["distribution_mode"];
export type WhatsAppConfig = Database["public"]["Tables"]["messaging_config"]["Row"];
export type EvolutionInstance = Database["public"]["Tables"]["evolution_configs"]["Row"];
export type MetaInstance = Database["public"]["Tables"]["meta_configs"]["Row"];

/** Mesma ordem do backend (contaParaAbordagem): texto livre antes de template. */
const ORDEM_DOS_PROVEDORES: WhatsAppProvider[] = ["evolution", "meta_official", "zernio"];

/**
 * Estado consolidado dos canais da organização.
 *
 * Desde 19/10/2026 a empresa tem VÁRIAS contas ao mesmo tempo (Evolution +
 * Meta + Zernio, vários números). `configured` é verdadeiro quando existe ao
 * menos uma conta ativa: é o que /whatsapp usa para decidir entre o assistente
 * e a Inbox. `provider` continua existindo para quem precisa de UM provedor de
 * referência (abordagem ativa, textos de ajuda): é o da primeira conta que
 * pode iniciar conversa, na ordem Evolution > Meta > Zernio.
 *
 * As linhas dos provedores (evolution/meta/zernio) só vêm para admins, porque
 * guardam credenciais; membro comum recebe null nelas e decide tudo pelas contas.
 */
export interface WhatsAppSetup {
  config: WhatsAppConfig | null;
  evolution: EvolutionInstance | null;
  meta: MetaInstance | null;
  zernio: Database["public"]["Tables"]["zernio_configs"]["Row"] | null;
  contas: ContaDeCanal[];
  contasAtivas: ContaDeCanal[];
  provedores: WhatsAppProvider[];
  provider: WhatsAppProvider | null;
  /** Alguma conta ativa de Meta ou Zernio: templates e campanhas oficiais. */
  temProvedorOficial: boolean;
  configured: boolean;
}

export function useWhatsAppSetup() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["whatsapp-setup", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<WhatsAppSetup> => {
      const [config, evolution, meta, zernio, contas] = await Promise.all([
        supabase.from("messaging_config").select("*").eq("org_id", orgId!).maybeSingle(),
        supabase
          .from("evolution_configs")
          .select("*")
          .eq("org_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("meta_configs")
          .select("*")
          .eq("org_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("zernio_configs").select("*").eq("org_id", orgId!).maybeSingle(),
        supabase.rpc("contas_de_canal"),
      ]);

      if (config.error) throw config.error;
      if (evolution.error) throw evolution.error;
      if (meta.error) throw meta.error;
      if (zernio.error) throw zernio.error;
      if (contas.error) throw contas.error;

      let todas = contas.data ?? [];
      // Zernio configurado antes das contas de canal (16/10/2026) e sem nenhuma
      // conta ainda: a listagem de contas do Zernio é quem as cria (uma por
      // plataforma). Sem isso a Inbox sumiria para quem só usa Zernio. A linha de
      // zernio_configs só vem para admin, que é quem abre a tela e cura o resto.
      if (zernio.data && !todas.some((c) => c.provider === "zernio")) {
        const { error: erroZernio } = await supabase.functions.invoke("zernio-list-accounts", { body: {} });
        if (!erroZernio) {
          const relido = await supabase.rpc("contas_de_canal");
          if (relido.error) throw relido.error;
          todas = relido.data ?? [];
        }
      }
      const contasAtivas = todas.filter((c) => c.is_active);
      const provedores = [...new Set(contasAtivas.map((c) => c.provider))];
      const queIniciam = contasAtivas.filter(podeIniciarConversa);
      const principal =
        ORDEM_DOS_PROVEDORES.find((p) => queIniciam.some((c) => c.provider === p)) ??
        ORDEM_DOS_PROVEDORES.find((p) => provedores.includes(p)) ??
        null;

      return {
        config: config.data ?? null,
        evolution: evolution.data ?? null,
        meta: meta.data ?? null,
        zernio: zernio.data ?? null,
        contas: todas,
        contasAtivas,
        provedores,
        provider: principal,
        temProvedorOficial: provedores.includes("meta_official") || provedores.includes("zernio"),
        configured: contasAtivas.length > 0,
      };
    },
  });
}

/**
 * Grava o último provedor conectado em messaging_config.
 *
 * Com contas de canal, o provedor "da org" deixou de decidir qualquer coisa no
 * app; a coluna segue preenchida porque remixes antigos (functions anteriores
 * a 16/10/2026) ainda a leem, e porque é a linha onde mora a distribuição.
 */
export function useSetProvider() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: WhatsAppProvider) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase
        .from("messaging_config")
        .upsert({ org_id: orgId, provider, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-setup", orgId] }),
  });
}

/** Atualiza a distribuição de conversas (modo + tempo de redistribuição offline). */
export function useSetDistribution() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { distribution_mode: DistributionMode; offline_timeout_minutes: number }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase
        .from("messaging_config")
        .upsert(
          {
            org_id: orgId,
            distribution_mode: input.distribution_mode,
            offline_timeout_minutes: input.offline_timeout_minutes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "org_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-setup", orgId] }),
  });
}

/** Depois de conectar ou verificar um número, a lista de contas e o setup mudam juntos. */
function invalidarCanal(queryClient: ReturnType<typeof useQueryClient>, orgId: string | null | undefined) {
  queryClient.invalidateQueries({ queryKey: ["whatsapp-setup", orgId] });
  queryClient.invalidateQueries({ queryKey: ["channel-accounts", orgId] });
}

/**
 * Cria/conecta uma instância Evolution.
 *
 * Delega à edge function `evolution-connect`, que registra a instância no
 * servidor Evolution e devolve o QR Code para parear o número. A api_key nunca
 * transita pelo cliente depois disso.
 */
export function useConnectEvolution() {
  const queryClient = useQueryClient();
  const orgId = useOrgId();

  return useMutation({
    mutationFn: async (input: {
      server_url: string;
      api_key: string;
      instance_name: string;
      display_name?: string;
      mode?: "create" | "existing";
    }) => {
      const { data, error } = await supabase.functions.invoke("evolution-connect", { body: input });
      if (error) throw await erroDeFunction(error, "Falha ao conectar à Evolution.");
      if (data?.error) throw new Error(data.error);
      return data as {
        instance_id: string;
        qr_code: string | null;
        status: string;
        warning: string | null;
      };
    },
    onSuccess: () => invalidarCanal(queryClient, orgId),
  });
}

export interface EvolutionServerInstance {
  instance_name: string;
  state: string;
  profile_name: string | null;
  phone_number: string | null;
}

/**
 * Lista as instâncias existentes de um servidor Evolution.
 *
 * É uma mutation (e não query) porque depende das credenciais digitadas no
 * wizard e só deve rodar quando o usuário pede a listagem.
 */
export function useEvolutionInstances() {
  return useMutation({
    mutationFn: async (input: { server_url: string; api_key: string }) => {
      const { data, error } = await supabase.functions.invoke("evolution-list-instances", {
        body: input,
      });
      if (error) throw await erroDeFunction(error, "Falha ao listar instâncias.");
      if (data?.error) throw new Error(data.error);
      return (data?.instances ?? []) as EvolutionServerInstance[];
    },
  });
}

/**
 * Verifica as credenciais Meta e registra a instância.
 *
 * Delega à edge function `meta-verify`, que confere o phone_number_id contra a
 * Graph API e configura o webhook.
 */
export function useVerifyMeta() {
  const queryClient = useQueryClient();
  const orgId = useOrgId();

  return useMutation({
    mutationFn: async (input: {
      phone_number_id: string;
      business_account_id: string;
      access_token: string;
      app_secret: string;
      display_name?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("meta-verify", { body: input });
      if (error) throw await erroDeFunction(error, "Falha ao verificar a conta Meta.");
      if (data?.error) throw new Error(data.error);
      return data as {
        instance_id: string;
        phone_number: string | null;
        webhook_verify_token: string;
        webhook_verified: boolean;
      };
    },
    onSuccess: () => invalidarCanal(queryClient, orgId),
  });
}

/**
 * Pergunta ao servidor Evolution qual é o estado real da instância e reconcilia
 * o banco.
 *
 * O poll de `useEvolutionStatus` lê `evolution_configs`, que é alimentado pelo
 * webhook. Quando o `CONNECTION_UPDATE` se perde, o banco fica em "connecting"
 * indefinidamente e o wizard mostra um QR de um número já pareado, sem saída.
 * Esta consulta cobre esse buraco perguntando em vez de esperar.
 */
export function useSyncEvolutionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase.functions.invoke("evolution-sync-status", {
        body: { instance_id: instanceId },
      });
      if (error) throw await erroDeFunction(error, "Falha ao consultar o estado da instância.");
      if (data?.error) throw new Error(data.error);
      return data as { status: string; state: string | null; reconciliado?: boolean };
    },
    onSuccess: (_data, instanceId) =>
      queryClient.invalidateQueries({ queryKey: ["evolution-status", instanceId] }),
  });
}

/** Consulta o status atual de pareamento da instância Evolution (poll do QR). */
export function useEvolutionStatus(instanceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["evolution-status", instanceId],
    enabled: !!instanceId && enabled,
    refetchInterval: enabled ? 4000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evolution_configs")
        .select("id, status, qr_code, phone_number, connected_at")
        .eq("id", instanceId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
