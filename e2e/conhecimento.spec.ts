import { test, expect } from "@playwright/test";

/**
 * Sprint 12 B10: Configurações > IA > Conhecimento. Envia um TXT (extração no
 * navegador), vê o material em uso com 1 trecho, cadastra um fato e confere
 * que a busca de teste encontra os dois. Apaga no fim.
 */
test("IA > Conhecimento: envia TXT, cadastra fato e a busca encontra", async ({ page }) => {
  test.setTimeout(120_000);
  const marca = Date.now().toString().slice(-6);
  const codigo = `E2E${marca}`;

  await page.goto("/settings/ia");
  await page.getByTestId("knowledge-tab-documentos").click();
  await page.getByTestId("doc-file").setInputFiles({
    name: `manual-${marca}.txt`, mimeType: "text/plain",
    buffer: Buffer.from(`Manual E2E ${codigo}.\n\nO frete para Florianópolis sai em 2 dias úteis no plano ${codigo}.`, "utf-8"),
  });
  const item = page.getByTestId("doc-list").getByText(`manual-${marca}`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("doc-list")).toContainText("1 trecho");
  await expect(page.getByTestId("doc-list")).toContainText("Em uso");

  await page.getByTestId("knowledge-tab-fatos").click();
  await page.getByTestId("fact-new").click();
  await page.getByTestId("fact-title").fill(`E2E Fato ${codigo}`);
  await page.getByTestId("fact-text").fill(`O prazo do plano ${codigo} é de 2 dias úteis.`);
  await page.getByTestId("fact-save").click();
  await expect(page.getByTestId("fact-list")).toContainText(`E2E Fato ${codigo}`);

  await page.getByTestId("knowledge-tab-busca").click();
  await page.getByTestId("search-input").fill(`prazo do plano ${codigo}`);
  await page.getByTestId("search-run").click();
  await expect(page.getByTestId("search-results")).toContainText("Fato");
  await expect(page.getByTestId("search-results")).toContainText("Documento");

  // Limpeza pela própria tela.
  await page.getByTestId("knowledge-tab-fatos").click();
  await page.getByRole("button", { name: `Apagar E2E Fato ${codigo}` }).click();
  await expect(page.getByTestId("fact-list").getByText(`E2E Fato ${codigo}`)).toHaveCount(0);
  await page.getByTestId("knowledge-tab-documentos").click();
  await page.getByRole("button", { name: `Apagar manual-${marca}` }).click();
  await expect(page.getByTestId("doc-list").getByText(`manual-${marca}`)).toHaveCount(0);
});
