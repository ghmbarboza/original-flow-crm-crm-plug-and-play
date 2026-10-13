/**
 * Janela de 24h do WhatsApp oficial e variáveis de template.
 *
 * Pela API Oficial (Meta) e pelo Zernio, texto livre só é entregue até 24h
 * depois da última mensagem do cliente. Passado isso, a única coisa que chega é
 * um template aprovado. A Evolution não tem essa regra (nem templates).
 *
 * `PADRAO_VARIAVEL` e `renderTemplate` existem também em
 * `supabase/functions/_shared/templateWhatsapp.ts` (Deno não importa daqui). A
 * prévia da tela e o texto gravado na conversa precisam sair iguais; o teste
 * `templateWhatsapp.test.ts` compara os dois padrões.
 */
const PADRAO_VARIAVEL = /\{\{\s*(\d+)\s*\}\}/g;

export const JANELA_ATENDIMENTO_MS = 24 * 60 * 60 * 1000;

const PROVEDORES_COM_TEMPLATE = ["meta_official", "zernio"];

/** Cumprimento logo antes da variável: é o sinal de que ela leva o nome da pessoa. */
const CUMPRIMENTO_ANTES =
  /(?:^|[^\p{L}])(ol[áa]|oi+|opa|bom dia|boa tarde|boa noite|prezad[oa]|car[oa]|hello|hi|hey|hola)[\s,]*$/iu;

export function conversaUsaTemplate(conversa: { channel: string; provider: string }): boolean {
  return conversa.channel === "whatsapp" && PROVEDORES_COM_TEMPLATE.includes(conversa.provider);
}

interface MensagemDaJanela {
  direction: string;
  sent_at: string;
  is_internal_note: boolean;
}

/** A janela está fechada quando o cliente não escreveu nas últimas 24h. */
export function janelaFechada(mensagens: MensagemDaJanela[], agora: number = Date.now()): boolean {
  const limite = agora - JANELA_ATENDIMENTO_MS;
  return !mensagens.some(
    (m) => m.direction === "inbound" && !m.is_internal_note && Date.parse(m.sent_at) > limite,
  );
}

/** Números das variáveis do corpo ({{1}}, {{2}}, ...), sem repetir, em ordem. */
export function variaveisDoTemplate(corpo: string): string[] {
  const numeros = new Set([...corpo.matchAll(PADRAO_VARIAVEL)].map((m) => Number(m[1])));
  return [...numeros].sort((a, b) => a - b).map(String);
}

/**
 * Valor inicial de cada variável, na ordem do template.
 *
 * Só a variável que vem depois de um cumprimento recebe o nome: preencher
 * "Seu pedido {{1}}" com o nome da pessoa mandaria uma mensagem errada sem
 * ninguém perceber. O resto fica em branco para quem envia completar.
 */
export function sugerirParametros(corpo: string, primeiroNome: string): string[] {
  const variaveisDeNome = new Set<string>();
  for (const m of corpo.matchAll(PADRAO_VARIAVEL)) {
    if (CUMPRIMENTO_ANTES.test(corpo.slice(0, m.index))) variaveisDeNome.add(String(Number(m[1])));
  }
  return variaveisDoTemplate(corpo).map((numero) => (variaveisDeNome.has(numero) ? primeiroNome : ""));
}

/** Texto final do template com os valores no lugar das variáveis. */
export function renderTemplate(corpo: string, parametros: string[]): string {
  return corpo.replace(PADRAO_VARIAVEL, (_m, numero: string) => parametros[Number(numero) - 1] ?? "");
}

/** Primeiro nome da pessoa da conversa: contato do CRM, senão o nome do WhatsApp. */
export function primeiroNomeDaConversa(conversa: {
  contact: { first_name: string; last_name: string | null } | null;
  channel_contact_name: string | null;
}): string {
  const doContato = conversa.contact?.first_name?.trim();
  if (doContato) return doContato;
  return conversa.channel_contact_name?.trim().split(/\s+/)[0] ?? "";
}
