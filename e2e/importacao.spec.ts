import { test, expect } from "@playwright/test";

/** Sprint 12 B8: importa um CSV de contatos pela tela, vê o resultado e desfaz. */
test("Configurações > Importação: CSV de contatos com de/para automático, resultado e desfazer", async ({ page }) => {
  test.setTimeout(120_000);
  const marca = Date.now().toString().slice(-6);
  const csv = [
    "Nome;E-mail;Telefone;Cargo",
    `E2E Import Um ${marca};e2e-import-um-${marca}@exemplo.com.br;(48) 99999-0001;Gerente`,
    `E2E Import Dois ${marca};e2e-import-dois-${marca}@exemplo.com.br;(48) 99999-0002;Analista`,
  ].join("\n");

  await page.goto("/settings/importacao");
  await expect(page.getByTestId("import-settings")).toBeVisible();
  await page.getByTestId("import-file").setInputFiles({ name: `contatos-${marca}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });

  // De/para automático: Nome, E-mail, Telefone e Cargo reconhecidos.
  await expect(page.getByTestId("import-map-0")).toContainText("Nome completo");
  await expect(page.getByTestId("import-map-1")).toContainText("E-mail");
  await expect(page.getByTestId("import-map-3")).toContainText("Cargo");
  await page.getByTestId("import-next").click();
  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-result")).toContainText("2 criados", { timeout: 60_000 });

  await page.goto("/contacts");
  await page.getByPlaceholder(/buscar/i).first().fill(`e2e-import-um-${marca}`);
  await expect(page.getByText(`E2E Import Um ${marca}`)).toBeVisible();

  await page.goto("/settings/importacao?secao=historico");
  await page.getByTestId("import-undo").first().click();
  await expect(page.getByText(/Desfeito: 2 contatos/)).toBeVisible();
});
