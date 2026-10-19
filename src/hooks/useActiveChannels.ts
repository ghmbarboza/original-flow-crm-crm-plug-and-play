import { canaisAtivos } from "@/lib/channelStatus";
import { useChannelAccounts } from "@/hooks/useChannelAccounts";

/**
 * Canais realmente conectados na organização — fonte única para qualquer
 * seletor de canais (ex.: canais que um agente atende). Vem das contas de
 * canal: cada plataforma do Zernio e cada número são uma conta.
 */
export function useActiveChannels(): { channels: string[]; isLoading: boolean } {
  const { data: contas, isLoading } = useChannelAccounts();
  return { channels: canaisAtivos(contas), isLoading };
}
