import { statusDoCanal, type StatusDoCanal } from "@/lib/channelStatus";
import { useChannelAccounts } from "@/hooks/useChannelAccounts";

/** Status consolidado do canal de atendimento (card de Integrações, checklist). */
export function useChannelStatus(): StatusDoCanal {
  const { data } = useChannelAccounts();
  return statusDoCanal(data);
}
