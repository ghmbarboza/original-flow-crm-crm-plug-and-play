import { test, expect, type Page } from "@playwright/test";
import { gotoPage, uniqueName } from "./helpers";

/**
 * Cria um negócio e abre o detalhe dele.
 *
 * A etapa é escolhida explicitamente: sem stage_id o deal não entra no kanban,
 * e o default de etapa é assíncrono — selecionar evita essa corrida.
 */
async function criarNegocioEAbrir(page: Page, title: string, value = "1000") {
  await gotoPage(page, "/deals", "Negócios");
  await page.getByTestId("deal-new").click();

  const dialog = page.getByTestId("deal-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#stage").click();
  await page.getByRole("option").first().click();
  await dialog.locator("#value").fill(value);
  await dialog.locator("#title").fill(title); // por último: depois do reset do form
  await page.getByTestId("deal-submit").click();
  await expect(dialog).toBeHidden();

  // Abre o card no drawer e segue para a página completa.
  await page.locator('[data-testid="deal-card"]', { hasText: title }).click();
  await page.getByTestId("deal-open-full").click();
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

test("negócio: muda de etapa pelo detalhe e marca como ganho", async ({ page }) => {
  const title = uniqueName("Negócio Ganho");
  await criarNegocioEAbrir(page, title);

  // ---- Trocar etapa pelo select (caminho estável, sem drag-and-drop) ----
  const stageSelect = page.getByTestId("deal-stage-select");
  const stageAntes = await stageSelect.textContent();

  await stageSelect.click();
  const options = page.getByRole("option");
  // Escolhe uma etapa diferente da atual.
  const total = await options.count();
  expect(total).toBeGreaterThan(1);
  for (let i = 0; i < total; i++) {
    const label = await options.nth(i).textContent();
    if (label && label.trim() !== stageAntes?.trim()) {
      await options.nth(i).click();
      break;
    }
  }
  await expect(stageSelect).not.toHaveText(stageAntes ?? "");

  // ---- Marcar como ganho ----
  await page.getByTestId("deal-mark-won").click();
  await expect(page.getByText("Ganho", { exact: true }).first()).toBeVisible();
  // Ganho fecha o negócio: as ações de ganho/perda somem e sobra Reabrir.
  await expect(page.getByTestId("deal-mark-won")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reabrir" })).toBeVisible();
});

test("negócio: marca como perdido com motivo", async ({ page }) => {
  const title = uniqueName("Negócio Perdido");
  await criarNegocioEAbrir(page, title);

  await page.getByTestId("deal-mark-lost").click();
  await page.getByTestId("deal-loss-reason").click();
  // Primeira opção real de motivo (a de índice 0 é "Sem motivo específico").
  await page.getByRole("option").nth(1).click();
  await page.getByTestId("deal-confirm-lost").click();

  await expect(page.getByTestId("deal-mark-lost")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reabrir" })).toBeVisible();
});

test("negócio: vincular produto recalcula o valor", async ({ page }) => {
  const productName = uniqueName("Produto");
  const title = uniqueName("Negócio Produto");

  // Cria o produto no próprio teste. Depender de um produto pré-existente
  // faria o teste pular (ou falhar) por estado do banco, não por regressão.
  await gotoPage(page, "/products", "Produtos");
  await page.getByTestId("product-new").click();
  const productDialog = page.getByTestId("product-dialog");
  await expect(productDialog).toBeVisible();
  await productDialog.locator("#name").fill(productName);
  await productDialog.locator("#price").fill("250");
  await page.getByTestId("product-submit").click();
  await expect(productDialog).toBeHidden();

  // Negócio nasce com valor 0 para o recálculo ser inequívoco.
  await criarNegocioEAbrir(page, title, "0");

  await page.getByTestId("deal-product-select").click();
  await page.getByRole("option", { name: new RegExp(productName) }).click();
  await page.getByTestId("deal-product-qty").fill("2");
  await page.getByTestId("deal-product-add").click();

  // 2 × R$ 250 = R$ 500. O valor do negócio soma os produtos vinculados.
  await expect(page.getByTestId("deal-value")).toContainText("500");
});
