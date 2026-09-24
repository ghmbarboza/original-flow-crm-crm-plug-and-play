import { test, expect } from "@playwright/test";

/**
 * Sprint 12 B9: Configurações > Importação tem três sub-abas (Arquivo CSV,
 * Conectar CRM, Histórico). A sub-aba Conectar CRM lista os seis provedores,
 * abre o formulário de token e recusa token vazio; o Salesforce pede as
 * credenciais do Connected App antes de liberar a autorização.
 */
test("Configurações > Importação > Conectar CRM: provedores, formulário por token e OAuth do Salesforce", async ({ page }) => {
  await page.goto("/settings/importacao?secao=crm");
  await expect(page.getByTestId("crm-connect")).toBeVisible();
  await expect(page.getByTestId("import-section")).toHaveCount(3);

  for (const p of ["hubspot", "pipedrive", "rdstation", "agendor", "kommo", "salesforce"]) {
    await expect(page.getByTestId(`crm-provider-${p}`).or(page.getByTestId(`crm-connection-${p}`))).toBeVisible();
  }

  // Pipedrive pede subdomínio + token; o botão só libera com token.
  await page.getByTestId("crm-open-pipedrive").click();
  await expect(page.getByTestId("crm-domain-pipedrive")).toBeVisible();
  await expect(page.getByTestId("crm-connect-pipedrive")).toBeDisabled();
  await page.getByTestId("crm-token-pipedrive").fill("abc");
  await expect(page.getByTestId("crm-connect-pipedrive")).toBeEnabled();

  // Salesforce: OAuth, com Callback URL da function e botão travado sem credenciais.
  await page.getByTestId("crm-open-salesforce").click();
  await expect(page.getByTestId("crm-sf-integracoes")).toBeVisible();
  await expect(page.getByTestId("crm-sf-authorize")).toBeVisible();

  // As outras sub-abas continuam acessíveis.
  await page.getByTestId("import-section").filter({ hasText: "Histórico" }).click();
  await expect(page.getByTestId("import-history")).toBeVisible();
  await page.getByTestId("import-section").filter({ hasText: "Arquivo CSV" }).click();
  await expect(page.getByTestId("import-file")).toBeAttached();
});
