import { canaisAtivos } from "@/lib/channelStatus";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";
import { useZernioAccounts } from "@/hooks/useZernioConfig";

/**
 * Canais realmente conectados na organização — fonte única para qualquer
 * seletor de canais (ex.: canais que um agente atende).
 */
export function useActiveChannels(): { channels: string[]; isLoading: boolean } {
  const { data: setup, isLoading: carregandoSetup } = useWhatsAppSetup();
  const ehZernio = setup?.provider === "zernio";
  const { data: contas, isLoading: carregandoContas } = useZernioAccounts(!!ehZernio);

  return {
    channels: canaisAtivos(setup, contas),
    isLoading: carregandoSetup || (ehZernio && carregandoContas),
  };
}