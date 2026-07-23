import { test, expect } from "@playwright/test";

test("cria uma empresa", async ({ page }) => {
  await page.goto("/companies");
  await expect(page.getByRole("heading", { name: "Empresas", level: 1 })).toBeVisible();

  const name = `Empresa E2E ${Date.now()}`;

  await page.getByRole("button", { name: "Nova empresa" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Nova empresa" })).toBeVisible();
  await dialog.locator("#name").fill(name);
  await dialog.getByRole("button", { name: "Criar empresa" }).click();

  await expect(page.getByText("Empresa criada.")).toBeVisible();
  await expect(dialog).toBeHidden();

  // Aparece na tabela (filtra por nome único).
  await page.getByPlaceholder("Buscar por nome, domínio ou setor").fill(name);
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
});
