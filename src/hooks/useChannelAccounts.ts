import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

/**
 * Contas de canal: cada número de WhatsApp (instância Evolution, número Meta)
 * ou conta de plataforma do Zernio conectada à organização, com papel, IA e
 * estado real da conexão. Vem da RPC `contas_de_canal` (sem credencial), que
 * todo membro pode ler: é ela que decide se a Inbox abre.
 */
export type ContaDeCanal = Database["public"]["Functions"]["contas_de_canal"]["Returns"][number];
export type PapelDaConta = "passivo" | "ativo" | "ambos";
export type ModoFunilDaConta = "inherit" | "auto" | "suggest";
export type EstadoDaConta = "conectada" | "aguardando" | "desconectada" | "desligada";

export const CHAVE_CONTAS = "channel-accounts";

export const PAPEL_LABEL: Record<PapelDaConta, string> = {
  passivo: "Só responde",
  ativo: "Prospecta e responde",
  ambos: "Responde e prospecta",
};

/** Rótulo que aparece na tela: nome dado pelo admin ou o identificador do número. */
export function rotuloDaConta(conta: Pick<ContaDeCanal, "label" | "detalhe" | "channel">): string {
  return conta.label.trim() || conta.detalhe || conta.channel;
}

/** Contas que podem iniciar conversa (abordagem ativa, envio pela automação). */
export function podeIniciarConversa(conta: Pick<ContaDeCanal, "role" | "is_active" | "channel">): boolean {
  return conta.is_active && conta.channel === "whatsapp" && conta.role !== "passivo";
}

export function useChannelAccounts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [CHAVE_CONTAS, orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ContaDeCanal[]> => {
      const { data, error } = await supabase.rpc("contas_de_canal");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Tudo que lê contas ou o setup do canal precisa recarregar depois de uma mudança. */
export function invalidarContas(queryClient: QueryClient, orgId: string | null | undefined) {
  queryClient.invalidateQueries({ queryKey: [CHAVE_CONTAS, orgId] });
  queryClient.invalidateQueries({ queryKey: ["whatsapp-setup", orgId] });
  queryClient.invalidateQueries({ queryKey: ["evolution-status"] });
}

export interface AtualizacaoDaConta {
  id: string;
  label?: string;
  role?: PapelDaConta;
  ai_enabled?: boolean;
  ai_instruction?: string;
  ai_funnel_mode?: ModoFunilDaConta;
}

/** Nome, papel, IA e regras próprias da conta (RLS: só admin da org). */
export function useUpdateChannelAccount() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: AtualizacaoDaConta) => {
      const { error } = await supabase.from("channel_accounts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarContas(queryClient, orgId),
  });
}

/** Conta pela qual saem os avisos de WhatsApp e os lembretes; null = automático. */
export function useSetNotificationsAccount() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contaId: string | null) => {
      const { error } = await supabase.rpc("definir_conta_de_notificacoes", { p_conta: contaId });
      if (error) throw error;
    },
    onSuccess: () => invalidarContas(queryClient, orgId),
  });
}

/**
 * Desliga UMA conta. A linha do provedor fica (instância, histórico e conversas
 * continuam apontando para ela); só deixa de receber e responder. Evolution e
 * Meta desligam pela tabela do provedor, e o gatilho espelha na conta; Zernio
 * desliga a conta direto, porque o profile é um só para todas as plataformas.
 */
export function useDisconnectChannelAccount() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conta: ContaDeCanal) => {
      const agora = new Date().toISOString();
      // Conta desligada não pode seguir marcada como a dos avisos: ao religar,
      // os avisos voltariam para ela sem ninguém escolher.
      if (conta.notifications_default) {
        const { error } = await supabase.rpc("definir_conta_de_notificacoes", { p_conta: null });
        if (error) throw error;
      }
      if (conta.provider === "evolution" && conta.evolution_config_id) {
        const { error } = await supabase.from("evolution_configs")
          .update({ is_active: false, status: "disconnected", updated_at: agora })
          .eq("id", conta.evolution_config_id);
        if (error) throw error;
        return;
      }
      if (conta.provider === "meta_official" && conta.meta_config_id) {
        const { error } = await supabase.from("meta_configs")
          .update({ is_active: false, updated_at: agora })
          .eq("id", conta.meta_config_id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("channel_accounts").update({ is_active: false }).eq("id", conta.id);
      if (error) throw error;
    },
    onSuccess: () => invalidarContas(queryClient, orgId),
  });
}

/**
 * Religa uma conta desligada de Meta ou Zernio (as credenciais seguem válidas).
 * Evolution não passa por aqui: o número precisa parear de novo pelo QR, no
 * assistente "Adicionar canal" > "Usar instância existente".
 */
export function useReactivateChannelAccount() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conta: ContaDeCanal) => {
      if (conta.provider === "evolution") throw new Error("Instância Evolution volta pelo QR Code: use Adicionar canal.");
      if (conta.provider === "meta_official" && conta.meta_config_id) {
        const { error } = await supabase.from("meta_configs")
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq("id", conta.meta_config_id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("channel_accounts").update({ is_active: true }).eq("id", conta.id);
      if (error) throw error;
    },
    onSuccess: () => invalidarContas(queryClient, orgId),
  });
}
