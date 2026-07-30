import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

/**
 * Lê uma credencial do ambiente e, se não achar, do `.env` da raiz.
 *
 * O `.env` está no `.gitignore` (linhas 36-37), então ler dali não versiona
 * nada — a regra que importa continua valendo: segredo nenhum entra no repo.
 *
 * O fallback existe porque exportar a variável no shell não sobrevive entre
 * invocações: cada `npm run` sobe um processo novo, e a auditoria são quatro
 * execuções separadas. Sem isso, o login e2e falhava antes da primeira varredura
 * e o run inteiro morria no setup.
 *
 * A precedência é ambiente primeiro: CI define a variável de verdade e não deve
 * ser sobreposto por um `.env` que por acaso exista na máquina.
 *
 * `.env.local` vem antes de `.env` porque só ele serve para segredo de verdade:
 * o `.env` deste projeto é RASTREADO pelo git (só tem chaves publicáveis do
 * Supabase), e o `.gitignore` não protege arquivo já versionado. E2E_PASSWORD e
 * SUPABASE_SERVICE_ROLE_KEY pertencem ao `.env.local`, que casa com a regra
 * `.env.*` do ignore e nunca foi rastreado.
 */
export function credencial(...chaves: string[]): string | undefined {
  for (const chave of chaves) {
    const doAmbiente = process.env[chave];
    if (doAmbiente) return doAmbiente;
  }
  for (const arquivo of [".env.local", ".env"]) {
    let env = "";
    try {
      env = readFileSync(arquivo, "utf8");
    } catch {
      continue;                       // arquivo ausente é caso normal, não erro
    }
    for (const chave of chaves) {
      const linha = env.split(/\r?\n/).find((l) => l.startsWith(`${chave}=`));
      const valor = linha?.slice(chave.length + 1).trim().replace(/^["']|["']$/g, "");
      if (valor) return valor;
    }
  }
  return undefined;
}

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
