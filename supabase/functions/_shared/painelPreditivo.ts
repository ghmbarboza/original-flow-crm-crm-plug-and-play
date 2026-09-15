// Conversão do envelope de webhook do FlowCRM para o formato do Painel Preditivo
// de Metas (function receive-crm-webhook da solução painelpreditivo-metascomerciaisimobiliario).
//
// Módulo puro, sem import de Deno: o webhook-dispatcher usa na entrega e o vitest
// testa em src/lib/painelPreditivo.test.ts.

export const ETAPAS_PAINEL = ["lead", "contato", "visita", "proposta", "fechamento"] as const;
export type EtapaPainel = (typeof ETAPAS_PAINEL)[number];

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * As etapas do FlowCRM têm nome livre (cada setor monta o seu funil). Primeiro
 * tenta pelo nome; se o nome não diz nada, usa a probabilidade de ganho da etapa.
 * Negócio ganho é sempre "fechamento".
 */
export function etapaDoPainel(deal: Obj): EtapaPainel {
  if (deal.status === "won") return "fechamento";
  const etapa = obj(deal.stage);
  const nome = semAcento(texto(etapa.name));
  if (/fech|ganh|assinad|vendid/.test(nome)) return "fechamento";
  if (/propost|negocia|contrato/.test(nome)) return "proposta";
  if (/visit|reuni|apresent|demo|agend/.test(nome)) return "visita";
  if (/contat|qualific|atendim|conversa/.test(nome)) return "contato";
  if (/lead|novo|entrada|prospec/.test(nome)) return "lead";

  const prob = Number(etapa.win_probability ?? deal.probability);
  if (!Number.isFinite(prob)) return "lead";
  if (prob >= 100) return "fechamento";
  if (prob >= 60) return "proposta";
  if (prob >= 35) return "visita";
  if (prob >= 15) return "contato";
  return "lead";
}

/** Origem do contato no vocabulário do painel: portal | indicacao | whatsapp | outro. */
export function origemDoPainel(source: unknown): "portal" | "indicacao" | "whatsapp" | "outro" {
  const s = semAcento(texto(source));
  if (!s) return "outro";
  if (s.includes("whatsapp")) return "whatsapp";
  if (/indica|referral|refer/.test(s)) return "indicacao";
  if (/portal|site|web|form|landing|zap|vivareal|olx|imovelweb|typeflow/.test(s)) return "portal";
  return "outro";
}

const GENEROS = ["masculino", "feminino", "outro", "nao_informado"];
const SEGMENTOS = ["alto_padrao", "medio", "economico", "lancamento"];

/**
 * Mapeia o evento do FlowCRM para o event_type do painel. null = o painel não usa.
 * deal.lost fica de fora: o painel não tem status de perdido, e mandar o negócio
 * com a última etapa faria parecer que ele ainda está em andamento.
 */
export function eventoDoPainel(evento: string): string | null {
  switch (evento) {
    case "deal.created": return "deal.created";
    case "deal.stage_changed": return "deal.stage_changed";
    case "deal.won": return "deal.closed";
    default: return null;
  }
}

/** Eventos de saída que fazem sentido para um destino no formato do painel. */
export const EVENTOS_PAINEL = ["deal.created", "deal.stage_changed", "deal.won"] as const;

/**
 * Corpo no formato do painel a partir do envelope padrão. Devolve null quando o
 * evento não é de negócio: o painel só guarda negócios.
 */
export function corpoPainelPreditivo(envelope: Obj): Obj | null {
  const evento = texto(envelope.event);
  const eventType = eventoDoPainel(evento);
  if (!eventType) return null;

  const data = obj(envelope.data);
  const deal = obj(data.deal);
  const contato = obj(data.contact);
  const camposNegocio = obj(deal.custom_fields);
  const camposContato = obj(contato.custom_fields);
  const etapa = etapaDoPainel(deal);

  const genero = texto(camposContato.gender ?? camposContato.genero ?? camposContato.client_gender);
  const segmento = texto(camposNegocio.segment ?? camposNegocio.segmento);
  const faixa = texto(camposContato.age_range ?? camposContato.faixa_etaria ?? camposContato.client_age_range);

  const corpo: Obj = {
    external_id: texto(deal.id),
    title: texto(deal.title),
    stage: etapa,
    value: Number(deal.value ?? 0) || 0,
    lead_origin: origemDoPainel(contato.source),
  };
  const email = texto(obj(deal.owner).email);
  if (email) corpo.user_email = email;
  if (GENEROS.includes(genero)) corpo.client_gender = genero;
  if (faixa) corpo.client_age_range = faixa;
  if (SEGMENTOS.includes(segmento)) corpo.segment = segmento;
  if (etapa === "fechamento") corpo.closed_at = texto(deal.updated_at) || texto(envelope.occurred_at) || new Date().toISOString();

  return { event_type: eventType, deal: corpo };
}
