import { test, expect } from "@playwright/test";
import { gotoPage, uniqueName } from "./helpers";

/**
 * Ciclo de vida completo do contato: criar, editar e excluir.
 *
 * Um teste só em vez de três: editar e excluir precisam de um contato existente,
 * e criar um em cada teste deixaria registro órfão no banco quando um deles
 * falhasse no meio. Aqui o mesmo registro nasce e morre dentro do teste.
 */
test("contato: cria, edita e exclui", async ({ page }) => {
  const name = uniqueName("Contato");
  const renamed = `${name} Editado`;

  await gotoPage(page, "/contacts", "Contatos");

  // ---- Criar ----
  await page.getByTestId("contact-new").click();
  const dialog = page.getByTestId("contact-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#first_name").fill(name);
  await dialog.locator("#email").fill(`e2e_${Date.now()}@example.com`);
  await page.getByTestId("contact-submit").click();
  await expect(dialog).toBeHidden();

  // Busca pelo nome único: não depende de ordenação nem de paginação.
  await page.getByTestId("contact-search").fill(name);
  const row = page.getByTestId("contact-row").filter({ hasText: name });
  await expect(row).toHaveCount(1);

  // ---- Editar ----
  await row.getByTestId("contact-row-actions").click();
  await page.getByTestId("contact-action-edit").click();
  await expect(dialog).toBeVisible();
  await dialog.locator("#first_name").fill(renamed);
  await page.getByTestId("contact-submit").click();
  await expect(dialog).toBeHidden();

  await page.getByTestId("contact-search").fill(renamed);
  await expect(page.getByTestId("contact-row").filter({ hasText: renamed })).toHaveCount(1);

  // ---- Excluir ----
  await page.getByTestId("contact-row").filter({ hasText: renamed })
    .getByTestId("contact-row-actions").click();
  await page.getByTestId("contact-action-delete").click();
  await page.getByTestId("confirm-delete").click();

  // A busca segue filtrando pelo nome editado; a linha some da lista.
  await expect(page.getByTestId("contact-row").filter({ hasText: renamed })).toHaveCount(0);
});

/**
 * Ficha do contato (/contacts/:id): navegação pelo drawer, anotação na timeline
 * e "Sem empresa vinculada" como estado legítimo. Mesmo padrão do teste acima:
 * o contato nasce e morre dentro do teste.
 */
test("ficha do contato: timeline, anotação e lead sem empresa", async ({ page }) => {
  const name = uniqueName("Ficha");
  const nota = `Anotação E2E ${Date.now()}`;

  await gotoPage(page, "/contacts", "Contatos");

  // Contato mínimo, sem empresa — para validar o estado "Sem empresa vinculada".
  await page.getByTestId("contact-new").click();
  const dialog = page.getByTestId("contact-dialog");
  await dialog.locator("#first_name").fill(name);
  await page.getByTestId("contact-submit").click();
  await expect(dialog).toBeHidden();

  // Linha → drawer → ficha completa.
  await page.getByTestId("contact-search").fill(name);
  await page.getByTestId("contact-row").filter({ hasText: name }).click();
  await page.getByTestId("contact-ver-ficha").click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("contact-detail-nome")).toHaveText(name);
  await expect(page.getByText("Sem empresa vinculada")).toBeVisible();

  // Anotação: cria e aparece na timeline com o destaque de nota.
  await page.getByTestId("contact-nova-anotacao").click();
  await page.getByTestId("contact-anotacao-texto").fill(nota);
  await page.getByTestId("contact-anotacao-salvar").click();
  await expect(page.getByTestId("timeline-nota").filter({ hasText: nota })).toBeVisible();

  // Limpeza pela própria UI, como o teste do ciclo de vida.
  await gotoPage(page, "/contacts", "Contatos");
  await page.getByTestId("contact-search").fill(name);
  await page.getByTestId("contact-row").filter({ hasText: name })
    .getByTestId("contact-row-actions").click();
  await page.getByTestId("contact-action-delete").click();
  await page.getByTestId("confirm-delete").click();
  await expect(page.getByTestId("contact-row").filter({ hasText: name })).toHaveCount(0);
});
