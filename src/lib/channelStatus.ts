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
  "Canal configurado, aguardando pareamento — finalize em Configurações > Integrações > Canais";

type EntradaDeCanal =
  | Partial<Pick<WhatsAppSetup, "evolution" | "meta" | "zernio" | "provider">>
  | null
  | undefined;

/**
 * Só o provedor ATIVO conta. Uma linha antiga de Evolution "connected" não pode
 * dizer "Conectado" quando a org migrou para Meta e ainda não verificou o
 * webhook — configs de provedores abandonados ficam no banco e mentiriam aqui.
 */
function conexoesDoProvedorAtivo(setup: EntradaDeCanal) {
  const provider = setup?.provider ?? null;
  const evolutionConectada =
    (!provider || provider === "evolution") && setup?.evolution?.status === "connected";
  const metaVerificada =
    (!provider || provider === "meta_official") &&
    !!setup?.meta?.webhook_verified &&
    setup?.meta?.is_active !== false;
  const zernioConectado =
    (!provider || provider === "zernio") &&
    !!setup?.zernio &&
    ["connected", "active"].includes(setup.zernio.status ?? "");
  const iniciado =
    (!provider && (!!setup?.evolution || !!setup?.meta || !!setup?.zernio)) ||
    (provider === "evolution" && !!setup?.evolution) ||
    (provider === "meta_official" && !!setup?.meta) ||
    (provider === "zernio" && !!setup?.zernio);
  return { evolutionConectada, metaVerificada, zernioConectado, iniciado };
}

export function statusDoCanal(setup: EntradaDeCanal): StatusDoCanal {
  const { evolutionConectada, metaVerificada, zernioConectado, iniciado } =
    conexoesDoProvedorAtivo(setup);

  if (evolutionConectada || metaVerificada || zernioConectado) {
    return { estado: "conectado", label: "Conectado" };
  }

  if (iniciado) {
    return { estado: "aguardando_pareamento", label: "Aguardando pareamento", detalhe: AGUARDANDO };
  }

  return { estado: "nao_conectado", label: "Não conectado" };
}

/** Conta Zernio como a listagem de canais ativos a enxerga. */
export interface ContaDeCanal {
  platform: string;
  isActive: boolean;
}

/**
 * Canais que a organização realmente atende hoje.
 *
 * Evolution/Meta só falam WhatsApp. Zernio fala o que estiver conectado nas
 * contas OAuth (a mesma fonte da seção "Canais ativos").
 */
export function canaisAtivos(
  setup: EntradaDeCanal,
  contasZernio?: ContaDeCanal[] | null,
): string[] {
  const canais = new Set<string>();
  const { evolutionConectada, metaVerificada, zernioConectado } = conexoesDoProvedorAtivo(setup);

  if (evolutionConectada || metaVerificada) canais.add("whatsapp");

  if (zernioConectado) {
    for (const conta of contasZernio ?? []) {
      if (conta.isActive) canais.add(conta.platform);
    }
  }

  return [...canais];
}
