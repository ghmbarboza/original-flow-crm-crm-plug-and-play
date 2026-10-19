import type { ContaDeCanal } from "@/hooks/useChannelAccounts";

/**
 * Fonte ÚNICA de verdade do status de conexão de canal.
 *
 * Existia lógica duplicada (card de Integrações, checklist do onboarding) e as
 * duas mentiam: uma instância Evolution em "connecting" (QR nunca pareado)
 * aparecia como "Conectado". Desde 19/10/2026 a entrada é a lista de contas de
 * canal (RPC contas_de_canal), que já traz o estado real de cada número:
 * Evolution pareada, Meta com webhook verificado, Zernio conectado. Só é
 * "conectado" quem realmente conversa; conta desligada não conta.
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

/** Só o que o helper lê: a tela e os testes não precisam da conta inteira. */
export type ContaParaStatus = Pick<ContaDeCanal, "estado" | "is_active" | "channel">;

type EntradaDeContas = ContaParaStatus[] | null | undefined;

function ativas(contas: EntradaDeContas): ContaParaStatus[] {
  return (contas ?? []).filter((c) => c.is_active);
}

export function statusDoCanal(contas: EntradaDeContas): StatusDoCanal {
  const lista = ativas(contas);
  if (lista.some((c) => c.estado === "conectada")) {
    return { estado: "conectado", label: "Conectado" };
  }
  if (lista.length > 0) {
    return { estado: "aguardando_pareamento", label: "Aguardando pareamento", detalhe: AGUARDANDO };
  }
  return { estado: "nao_conectado", label: "Não conectado" };
}

/**
 * Canais que a organização realmente atende hoje: o canal de cada conta ativa
 * e conectada (Evolution e Meta só falam WhatsApp; cada plataforma do Zernio é
 * uma conta própria).
 */
export function canaisAtivos(contas: EntradaDeContas): string[] {
  const canais = new Set<string>();
  for (const conta of ativas(contas)) {
    if (conta.estado === "conectada") canais.add(conta.channel);
  }
  return [...canais];
}
