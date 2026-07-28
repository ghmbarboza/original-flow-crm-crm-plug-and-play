import { test, expect } from "@playwright/test";
import { gotoPage, uniqueName } from "./helpers";

/**
 * Empresa criada e depois vinculada a um contato.
 *
 * O vínculo é o que importa aqui: criar empresa isolada não prova que ela fica
 * disponível para o resto do CRM. O teste passa pelo select de empresa do
 * formulário de contato e confirma o resultado na coluna Empresa da lista.
 */
test("empresa: cria e vincula a um contato", async ({ page }) => {
  const companyName = uniqueName("Empresa");
  const contactName = uniqueName("Contato Vinculado");

  // ---- Criar empresa ----
  await gotoPage(page, "/companies", "Empresas");
  await page.getByTestId("company-new").click();

  const companyDialog = page.getByTestId("company-dialog");
  await expect(companyDialog).toBeVisible();
  await companyDialog.locator("#name").fill(companyName);
  await page.getByTestId("company-submit").click();
  await expect(companyDialog).toBeHidden();

  await page.getByTestId("company-search").fill(companyName);
  await expect(page.getByTestId("company-row").filter({ hasText: companyName })).toHaveCount(1);

  // ---- Criar contato já apontando para ela ----
  await gotoPage(page, "/contacts", "Contatos");
  await page.getByTestId("contact-new").click();

  const contactDialog = page.getByTestId("contact-dialog");
  await expect(contactDialog).toBeVisible();
  await contactDialog.locator("#first_name").fill(contactName);

  await page.getByTestId("contact-company-select").click();
  await page.getByRole("option", { name: companyName }).click();

  await page.getByTestId("contact-submit").click();
  await expect(contactDialog).toBeHidden();

  // O vínculo aparece na coluna Empresa da linha do contato.
  await page.getByTestId("contact-search").fill(contactName);
  const row = page.getByTestId("contact-row").filter({ hasText: contactName });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(companyName);
});
