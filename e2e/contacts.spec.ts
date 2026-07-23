import { test, expect } from "@playwright/test";

test("cria um contato", async ({ page }) => {
  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Contatos", level: 1 })).toBeVisible();

  const firstName = `Contato E2E ${Date.now()}`;

  await page.getByRole("button", { name: "Novo contato" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Novo contato" })).toBeVisible();
  await dialog.locator("#first_name").fill(firstName);
  await dialog.locator("#email").fill(`e2e_${Date.now()}@example.com`);
  await dialog.getByRole("button", { name: "Criar contato" }).click();

  // Sucesso: toast + diálogo fecha.
  await expect(page.getByText("Contato criado.")).toBeVisible();
  await expect(dialog).toBeHidden();

  // O contato aparece na lista (filtra por nome único para não depender de paginação).
  await page
    .getByPlaceholder("Buscar por nome, email, telefone ou empresa")
    .fill(firstName);
  await expect(page.getByText(firstName)).toBeVisible();
});
