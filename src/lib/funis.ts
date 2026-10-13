// Regras puras de quando a organização tem mais de um funil.

export const MAX_NOME_FUNIL = 60;

interface FunilResumo {
  id: string;
  name: string;
  is_default: boolean;
}

/**
 * Funil que a tela deve mostrar: o que a pessoa deixou aberto, se ainda existe;
 * senão o padrão; senão o primeiro.
 */
export function funilAtivo(funis: readonly FunilResumo[], salvo: string | null): string | null {
  if (salvo && funis.some((f) => f.id === salvo)) return salvo;
  return (funis.find((f) => f.is_default) ?? funis[0])?.id ?? null;
}

/**
 * Negócios do funil. O funil do negócio é o da etapa dele; negócio sem etapa
 * não tem funil e aparece no padrão, para não sumir de todas as listas.
 */
export function negociosDoFunil<T extends { stage: { pipeline_id: string } | null }>(
  deals: readonly T[], funilId: string | null, padraoId: string | null,
): T[] {
  if (!funilId) return [...deals];
  return deals.filter((d) => (d.stage ? d.stage.pipeline_id === funilId : funilId === padraoId));
}

/**
 * Etapa que o formulário do negócio grava, calculada a cada desenho a partir
 * das etapas do funil escolhido. A etapa escolhida vale enquanto pertencer a
 * esse funil; fora dele (funil trocado, ou formulário recém-aberto) cai na
 * primeira etapa. `manterEscolhida` é a edição sem troca de funil: aí a etapa
 * do negócio fica como está, mesmo vazia. Assim o que é gravado nunca é de um
 * funil diferente do que a tela mostra.
 */
export function etapaDoFormulario(
  escolhida: string | null, etapasDoFunil: readonly { id: string }[], manterEscolhida: boolean,
): string | null {
  if (escolhida && etapasDoFunil.some((e) => e.id === escolhida)) return escolhida;
  if (manterEscolhida) return escolhida;
  return etapasDoFunil[0]?.id ?? null;
}

/** Mensagem do que impede salvar o nome do funil, ou null quando está tudo certo. */
export function validarNomeFunil(nome: string, outrosNomes: readonly string[]): string | null {
  const limpo = nome.trim();
  if (!limpo) return "Dê um nome para o funil.";
  if (limpo.length > MAX_NOME_FUNIL) return `O nome pode ter até ${MAX_NOME_FUNIL} caracteres.`;
  const repetido = outrosNomes.some((n) => n.trim().toLowerCase() === limpo.toLowerCase());
  return repetido ? "Já existe um funil com esse nome." : null;
}
