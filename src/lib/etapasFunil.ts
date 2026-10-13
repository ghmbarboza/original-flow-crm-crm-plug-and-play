// Regras puras da edição das etapas do funil (Configurações > Automações > Funil).

export const MAX_NOME_ETAPA = 60;
export const PROBABILIDADE_MAXIMA = 100;

/** O que depende de uma etapa hoje (ver useStageUsage). */
export interface UsoDaEtapa {
  negocios: number;
  formularios: number;
  perfisDeOrigem: number;
  gatilhosDeResposta: number;
}

/** Devolve os ids na nova ordem; posição inválida ou igual devolve a ordem atual. */
export function moverEtapa(ids: readonly string[], de: number, para: number): string[] {
  const foraDaLista = (i: number) => i < 0 || i >= ids.length;
  if (de === para || foraDaLista(de) || foraDaLista(para)) return [...ids];
  const semOrigem = ids.filter((_, i) => i !== de);
  return [...semOrigem.slice(0, para), ids[de], ...semOrigem.slice(para)];
}

/** Mensagem do que impede salvar o nome, ou null quando está tudo certo. */
export function validarNomeEtapa(nome: string, outrosNomes: readonly string[]): string | null {
  const limpo = nome.trim();
  if (!limpo) return "Dê um nome para a etapa.";
  if (limpo.length > MAX_NOME_ETAPA) return `O nome pode ter até ${MAX_NOME_ETAPA} caracteres.`;
  const repetido = outrosNomes.some((n) => n.trim().toLowerCase() === limpo.toLowerCase());
  return repetido ? "Já existe uma etapa com esse nome." : null;
}

/**
 * Lê a probabilidade digitada. Vazio ou fora de 0 a 100 devolve null: a etapa
 * nova não ganha um número que a pessoa não escolheu (a previsão de receita
 * usa esse valor).
 */
export function lerProbabilidade(texto: string): number | null {
  if (!texto.trim()) return null;
  const numero = Number(texto.replace(",", "."));
  if (!Number.isFinite(numero) || numero < 0 || numero > PROBABILIDADE_MAXIMA) return null;
  return Math.round(numero);
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/** Por que a etapa não pode ser excluída agora, ou null quando pode. */
export function motivoDoBloqueio(
  { unica, uso, falhouConferir }: { unica: boolean; uso: UsoDaEtapa | undefined; falhouConferir: boolean },
): string | null {
  if (unica) return "O funil precisa de pelo menos uma etapa. Crie outra antes de excluir esta.";
  if (falhouConferir) return "Não foi possível conferir o que depende desta etapa. Tente de novo em instantes.";
  if (!uso?.negocios) return null;
  const quantos = plural(uso.negocios, "negócio", "negócios");
  return `Esta etapa tem ${quantos}, contando ganhos e perdidos. Mova para outra etapa antes de excluir.`;
}

/** O que muda de comportamento em outras telas quando a etapa some. */
export function efeitosDaExclusao(uso: UsoDaEtapa): string[] {
  const efeitos: string[] = [];
  if (uso.formularios > 0) {
    efeitos.push(`${plural(uso.formularios, "formulário passa", "formulários passam")} a entregar o lead na primeira etapa do funil.`);
  }
  if (uso.perfisDeOrigem > 0) {
    efeitos.push(`${plural(uso.perfisDeOrigem, "perfil de origem da IA passa", "perfis de origem da IA passam")} a abrir o negócio na primeira etapa do funil.`);
  }
  if (uso.gatilhosDeResposta > 0) {
    efeitos.push(`${plural(uso.gatilhosDeResposta, "gatilho de resposta passa", "gatilhos de resposta passam")} a valer para negócio vindo de qualquer etapa anterior.`);
  }
  return efeitos;
}
