import { test, expect } from "@playwright/test";

test("cria um template de email", async ({ page }) => {
  await page.goto("/email-templates");
  await expect(page.getByRole("heading", { name: "Templates de email", level: 1 })).toBeVisible();

  const name = `Template E2E ${Date.now()}`;

  await page.getByRole("button", { name: "Novo template" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Novo template" })).toBeVisible();
  await dialog.locator("#tpl-name").fill(name);
  await dialog.locator("#tpl-subject").fill("Assunto do teste E2E");
  // Corpo é um textarea sem id — localizado pelo placeholder distintivo (aba Editar).
  await dialog.getByPlaceholder("<p>Olá {{contact.first_name}},</p>").fill("<p>Olá, teste e2e.</p>");
  await dialog.getByRole("button", { name: "Criar template" }).click();

  await expect(page.getByText("Template criado.")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name)).toBeVisible();
});
