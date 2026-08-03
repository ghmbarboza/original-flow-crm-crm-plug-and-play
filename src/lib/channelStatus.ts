import type { WhatsAppSetup } from "@/hooks/useWhatsAppConfig";

/**
 * Fonte ÚNICA de verdade do status de conexão de canal.
 *
 * Existia lógica duplicada (card de Integrações, checklist do onboarding) e as
 * duas mentiam: uma instância Evolution em "connecting" (QR nunca pareado)
 * aparecia como "Conectado". Aqui só é conectado quem realmente conversa:
 * Evolution pareada, Meta com webhook verificado e ativa, ou Zernio conectada.
 */
export type EstadoDoCanal = "conectado" | "aguardando_pareamento" | "nao_conectado";

export interface StatusDoCanal {
  estado: EstadoDoCanal;
  /** Rótulo curto para badge. */
  label: string;
  /** Explicação com o próximo passo, quando há algo a fazer. */
  detalhe?: string;
}

const AGUARDANDO =
  "Canal configurado, aguardando pareamento — finalize em Configurações > Canais";

type EntradaDeCanal = Partial<Pick<WhatsAppSetup, "evolution" | "meta" | "zernio">> | null | undefined;

export function statusDoCanal(setup: EntradaDeCanal): StatusDoCanal {
  const evolutionConectada = setup?.evolution?.status === "connected";
  const metaVerificada = !!setup?.meta?.webhook_verified && setup?.meta?.is_active !== false;
  const zernioConectado =
    !!setup?.zernio && ["connected", "active"].includes(setup.zernio.status ?? "");

  if (evolutionConectada || metaVerificada || zernioConectado) {
    return { estado: "conectado", label: "Conectado" };
  }

  const iniciado = !!setup?.evolution || !!setup?.meta || !!setup?.zernio;
  if (iniciado) {
    return { estado: "aguardando_pareamento", label: "Aguardando pareamento", detalhe: AGUARDANDO };
  }

  return { estado: "nao_conectado", label: "Não conectado" };
}
