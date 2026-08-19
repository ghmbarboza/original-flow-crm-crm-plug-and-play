/**
 * Variáveis aceitas nas mensagens programadas.
 *
 * Esta lista é a MESMA que `scheduled-message-dispatcher` sabe substituir. É
 * uma duplicação consciente — o dispatcher roda em Deno e não importa daqui —
 * e o que a mantém honesta é o teste em `messageVars.test.ts`, que compara a
 * lista com o mapa da edge function.
 *
 * Por que isso importa: o que não está aqui é trocado por VAZIO no envio, em
 * silêncio. Sugerir uma variável a mais na interface faria o usuário mandar
 * "Olá !" para o cliente sem nunca entender por quê.
 */
export const VARIAVEIS_MENSAGEM = [
  { chave: "contact.first_name", rotulo: "Primeiro nome" },
  { chave: "contact.last_name", rotulo: "Sobrenome" },
  { chave: "contact.name", rotulo: "Nome completo" },
] as const;

/**
 * Variáveis do follow-up e das campanhas.
 *
 * Vocabulário DIFERENTE do agendamento — `{{nome}}` em vez de
 * `{{contact.first_name}}` — porque os dispatchers são outros e já rodavam
 * assim. Unificar as duas famílias exigiria migrar os templates que os clientes
 * já escreveram, então cada tela declara o seu e o componente mostra só o que
 * vale ali. O que não pode é a tela oferecer o que o servidor não preenche.
 */
export const VARIAVEIS_FOLLOWUP = [
  { chave: "nome", rotulo: "Primeiro nome" },
  { chave: "empresa", rotulo: "Empresa" },
  { chave: "agente", rotulo: "Atendente" },
] as const;

export type VariavelMensagem = { chave: string; rotulo: string };

export type ValoresVariaveis = Record<string, string | null | undefined>;

/** Mesmo regex do dispatcher: `{{ chave }}` com espaços opcionais. */
export function renderVariaveis(template: string, valores: ValoresVariaveis): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, chave: string) => valores[chave] ?? "");
}

/** Monta os valores a partir do contato, na mesma ordem de precedência do envio. */
export function valoresDoContato(contato: {
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): ValoresVariaveis {
  const first = contato?.first_name ?? "";
  const last = contato?.last_name ?? "";
  return {
    "contact.first_name": first,
    "contact.last_name": last,
    "contact.name": [first, last].filter(Boolean).join(" "),
  };
}
