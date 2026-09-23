import { test, expect } from "@playwright/test";

/** Sprint 12 B5: aba API cria uma chave (mostrada uma vez) e revoga. */
test("Configurações > API: cria chave com escopos, vê uma vez e revoga", async ({ page }) => {
  const marca = Date.now().toString().slice(-6);
  await page.goto("/settings/api");
  await expect(page.getByTestId("api-settings")).toBeVisible();

  await page.getByTestId("api-key-new").click();
  await page.getByTestId("api-key-name").fill(`E2E chave ${marca}`);
  await page.getByTestId("api-key-create").click();
  const valor = await page.getByTestId("api-key-value").innerText();
  expect(valor).toMatch(/^fcrm_live_[0-9a-f]{64}$/);
  await page.getByRole("button", { name: "Fechar" }).click();

  const linha = page.getByTestId(`api-key-${valor.slice(0, 18)}`);
  await expect(linha).toContainText(`E2E chave ${marca}`);
  await linha.getByRole("button", { name: "Revogar" }).click();
  await expect(page.getByText(`Chave "E2E chave ${marca}" revogada.`)).toBeVisible();
  await expect(linha).toHaveCount(0);
});
