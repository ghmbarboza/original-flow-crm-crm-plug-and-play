import { test, expect } from "@playwright/test";

/** Sprint 12 B6: serviço por hora aparece com tipo e sufixo, e o filtro por tipo funciona. */
test("Produtos e serviços: cria serviço por hora e filtra por tipo", async ({ page }) => {
  const marca = Date.now().toString().slice(-6);
  const nome = `E2E Consultoria ${marca}`;

  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Produtos e serviços" })).toBeVisible();
  await page.getByTestId("product-new").click();
  await page.locator("#name").fill(nome);
  await page.getByTestId("product-kind").click();
  await page.getByRole("option", { name: "Serviço" }).click();
  await page.getByTestId("product-billing").click();
  await page.getByRole("option", { name: "Por hora" }).click();
  await page.locator("#price").fill("250");
  await page.locator("#duration_minutes").fill("60");
  await page.getByTestId("product-submit").click();
  await expect(page.getByText(/criado|atualizado/i).first()).toBeVisible();

  const linha = page.getByRole("row", { name: new RegExp(nome) });
  await expect(linha).toContainText("Serviço");
  await expect(linha).toContainText("/h");

  await page.getByTestId("product-kind-filter").click();
  await page.getByRole("option", { name: "Produto" }).click();
  await expect(page.getByRole("row", { name: new RegExp(nome) })).toHaveCount(0);
  await page.getByTestId("product-kind-filter").click();
  await page.getByRole("option", { name: "Serviço" }).click();
  await expect(page.getByRole("row", { name: new RegExp(nome) })).toBeVisible();
});
