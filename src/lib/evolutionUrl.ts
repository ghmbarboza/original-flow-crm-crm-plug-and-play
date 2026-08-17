/**
 * Normaliza a URL do servidor Evolution.
 *
 * O endereço que o usuário tem à mão costuma ser o do painel — o Evolution
 * Manager. Colar `https://servidor/manager` faz toda chamada de API cair em 404,
 * e o erro só aparece dois passos adiante ("falha ao criar instância"), longe da
 * causa. A barra final tem o mesmo efeito em servidores que não normalizam o
 * caminho. Corrigir aqui é mais honesto que explicar depois.
 */
export function normalizarServerUrl(valor: string): string {
  return valor
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/manager$/i, "")
    .replace(/\/+$/, "");
}
