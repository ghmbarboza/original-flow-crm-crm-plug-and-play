import { expect, type Page } from "@playwright/test";

/**
 * Nome único por execução.
 *
 * A suíte roda contra o backend real e serial, então os registros de um run
 * ficam no banco. Sufixo de timestamp + aleatório evita colisão entre runs e
 * permite buscar exatamente o registro deste teste, sem depender de ordenação
 * ou paginação da lista.
 */
export function uniqueName(prefix: string): string {
  return `${prefix} E2E ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Vai para uma rota e espera o H1 da página, que é o sinal de que montou. */
export async function gotoPage(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
}

/**
 * Falha se a página tiver renderizado um estado de erro.
 *
 * Usado nos testes de "abre sem erro": sem isso, uma tela que monta o cabeçalho
 * e quebra no corpo passaria despercebida, porque o H1 estaria lá.
 */
export async function expectNoErrorState(page: Page) {
  await expect(page.getByTestId("error-state")).toHaveCount(0);
}
