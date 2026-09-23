import { test, expect } from "@playwright/test";

/** Sprint 12 B4: IA > Por origem cria, edita e remove um perfil. Devolve o que mudou. */
test("IA > Por origem: cria um perfil, reabre e remove", async ({ page }) => {
  const marca = Date.now().toString().slice(-6);
  const origem = `e2e_origem_${marca}`;

  await page.goto("/settings/ia");
  await page.getByTestId("ai-tab-origens").click();
  await expect(page.getByTestId("source-profiles")).toBeVisible();

  await page.getByTestId("source-profile-new").click();
  await page.getByTestId("source-profile-source").fill(origem);
  await page.locator("#sp-label").fill("Origem E2E");
  await page.getByTestId("source-profile-instruction").fill("Sempre ofereça a demonstração gratuita.");
  await page.getByTestId("source-profile-save").click();
  await expect(page.getByText("Perfil criado.")).toBeVisible();
  await expect(page.getByTestId(`source-profile-${origem}`)).toContainText("Origem E2E");

  await page.reload();
  await page.getByTestId("ai-tab-origens").click();
  await expect(page.getByTestId(`source-profile-${origem}`)).toContainText("demonstração gratuita");

  await page.getByTestId(`source-profile-${origem}`).getByRole("button", { name: "Remover perfil" }).click();
  await expect(page.getByText(`Perfil da origem "${origem}" removido.`)).toBeVisible();
  await expect(page.getByTestId(`source-profile-${origem}`)).toHaveCount(0);
});
