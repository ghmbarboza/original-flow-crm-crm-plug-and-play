/**
 * Matriz canal x provedor das campanhas.
 *
 * Regra de negócio do Sprint 8: campanhas em massa só saem por provedor oficial.
 *  - Meta Oficial entrega em WhatsApp, Instagram e Facebook (é o alcance da
 *    Graph API para mensagens de negócio).
 *  - Zernio entrega em qualquer canal que a org tenha conectado nele.
 *  - Evolution nunca entrega: é API não-oficial, sujeita a bloqueio por spam.
 *
 * A mesma matriz está espelhada em constraint no banco
 * (campaigns_channel_provider_check), para que um par impossível não consiga
 * ser gravado nem pela API.
 */

export type CampaignProvider = "meta_official" | "zernio";

export const CAMPAIGN_CHANNELS = [
  "whatsapp",
  "instagram",
  "facebook",
  "telegram",
  "twitter",
  "youtube",
  "reddit",
  "bluesky",
  "threads",
] as const;

export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

/** Canais que a API Oficial da Meta consegue entregar. */
const META_CHANNELS: readonly string[] = ["whatsapp", "instagram", "facebook"];

/**
 * Canais que o Zernio consegue ABRIR conversa (POST /v1/inbox/conversations).
 * A API só suporta X/Twitter, Bluesky, Reddit e WhatsApp para iniciar thread;
 * nos demais o disparo em massa não tem como criar a conversa do zero.
 */
const ZERNIO_OUTBOUND_CHANNELS: readonly string[] = [
  "whatsapp",
  "twitter",
  "bluesky",
  "reddit",
];

export const PROVIDER_LABEL: Record<CampaignProvider, string> = {
  meta_official: "API Oficial (Meta)",
  zernio: "Zernio",
};

export interface ProviderOption {
  value: CampaignProvider;
  label: string;
  /** Por que está indisponível, quando estiver. */
  unavailableReason?: string;
}

/**
 * Provedores capazes de disparar no canal, considerando o que a org tem ativo.
 *
 * `activeProviders` são os provedores realmente configurados na organização —
 * sem isso a tela ofereceria uma opção que falharia no disparo.
 */
export function providersForChannel(
  channel: string,
  activeProviders: { meta: boolean; zernio: boolean },
): ProviderOption[] {
  const options: ProviderOption[] = [];

  if (META_CHANNELS.includes(channel)) {
    options.push({
      value: "meta_official",
      label: PROVIDER_LABEL.meta_official,
      unavailableReason: activeProviders.meta
        ? undefined
        : "Nenhuma instância Meta ativa nesta organização.",
    });
  }

  if (ZERNIO_OUTBOUND_CHANNELS.includes(channel)) {
    options.push({
      value: "zernio",
      label: PROVIDER_LABEL.zernio,
      unavailableReason: activeProviders.zernio
        ? undefined
        : "Zernio não configurado nesta organização.",
    });
  }

  return options;
}

/** Provedores utilizáveis agora — os disponíveis e sem motivo de bloqueio. */
export function usableProviders(
  channel: string,
  activeProviders: { meta: boolean; zernio: boolean },
): CampaignProvider[] {
  return providersForChannel(channel, activeProviders)
    .filter((o) => !o.unavailableReason)
    .map((o) => o.value);
}

/** Canais em que a org consegue disparar alguma campanha hoje. */
export function availableChannels(
  activeProviders: { meta: boolean; zernio: boolean },
): CampaignChannel[] {
  return CAMPAIGN_CHANNELS.filter(
    (ch) => usableProviders(ch, activeProviders).length > 0,
  );
}

/**
 * Limite de caracteres por canal. Só o X/Twitter tem teto relevante em DM;
 * nos demais o limite prático é alto o bastante para não valer aviso.
 */
export const CHANNEL_CHAR_LIMIT: Partial<Record<string, number>> = {
  twitter: 280,
};

/** Canais que aceitam mídia no disparo. */
export const CHANNEL_SUPPORTS_MEDIA: readonly string[] = [
  "whatsapp",
  "instagram",
  "facebook",
];

/**
 * Onde fica o identificador do destinatário naquele canal.
 * WhatsApp usa telefone; os demais usam o id da plataforma, que o Sprint 7
 * passou a guardar em contacts.custom_fields.channel_contact_id.
 */
export function recipientIdentifierLabel(channel: string): string {
  return channel === "whatsapp" ? "telefone" : "identificador do canal";
}

/**
 * Templates aprovados são exigidos para abrir conversa de negócio no WhatsApp,
 * nos dois provedores. Nos outros canais o envio é texto livre.
 */
export function requiresTemplate(channel: string, provider: CampaignProvider): boolean {
  if (channel !== "whatsapp") return false;
  // No Zernio a API recusa sem template (TEMPLATE_REQUIRED). Na Meta o texto
  // livre até passa dentro da janela de 24h, então lá o template é opcional.
  return provider === "zernio";
}
