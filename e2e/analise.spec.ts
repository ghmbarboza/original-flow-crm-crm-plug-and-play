import { test, expect } from "@playwright/test";

/**
 * Sprint 12 B12: IA > Análises (frequência, confiança, critério por etapa) e o
 * card "O que a IA sabe" na ficha do contato, com confirmação de um campo.
 */
test("IA > Análises salva a configuração; ficha do contato mostra e confirma o que a IA sabe", async ({ page }) => {
  test.setTimeout(120_000);
  const marca = Date.now().toString().slice(-6);

  await page.goto("/settings/ia");
  await page.getByTestId("ai-tab-analises").click();
  await expect(page.getByTestId("ai-analysis")).toBeVisible();
  await page.getByTestId("analysis-every").fill("4");
  await page.getByTestId("analysis-save").click();
  await expect(page.getByText("Configuração da análise salva.")).toBeVisible();

  // Contato novo e o card na ficha.
  const nome = `E2E Memória ${marca}`;
  await page.goto("/contacts");
  await page.getByTestId("contact-new").click();
  const dialog = page.getByTestId("contact-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#first_name").fill(nome);
  await page.getByTestId("contact-submit").click();
  await expect(dialog).toBeHidden();
  await page.getByTestId("contact-search").fill(nome);
  const row = page.getByTestId("contact-row").filter({ hasText: nome });
  await expect(row).toHaveCount(1);
  await row.click();
  await page.getByTestId("contact-ver-ficha").click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("contact-detail-nome")).toHaveText(nome);
  await expect(page.getByTestId("contact-memory")).toBeVisible();
  await expect(page.getByTestId("memory-company")).toContainText("não sabemos");

  await page.getByRole("button", { name: "Editar Empresa" }).click();
  await page.getByTestId("memory-input-company").fill(`Empresa ${marca}`);
  await page.getByTestId("memory-save-company").click();
  await expect(page.getByText("Informação confirmada.")).toBeVisible();
  await expect(page.getByTestId("memory-company")).toContainText(`Empresa ${marca}`);
  await expect(page.getByTestId("memory-company")).toContainText("confirmado");
});
