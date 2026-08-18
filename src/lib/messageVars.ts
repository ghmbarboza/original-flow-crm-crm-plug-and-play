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
