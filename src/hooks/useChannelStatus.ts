import { statusDoCanal, type StatusDoCanal } from "@/lib/channelStatus";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";

/** Status real do canal de atendimento, compartilhado por Integrações e onboarding. */
export function useChannelStatus(): StatusDoCanal {
  const { data } = useWhatsAppSetup();
  return statusDoCanal(data);
}
