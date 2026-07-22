import { test, expect } from "@playwright/test";

test("cria uma automação simples", async ({ page }) => {
  await page.goto("/automations");
  await expect(page.getByRole("heading", { name: "Automações", level: 1 })).toBeVisible();

  const name = `Automação E2E ${Date.now()}`;

  await page.getByRole("button", { name: "Nova automação" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Nova automação" })).toBeVisible();

  await dialog.locator("#auto-name").fill(name);
  // O gatilho já vem como "Novo contato criado" por padrão — não precisa mexer.
  // Adiciona ao menos uma ação (default "Enviar email") — obrigatório para salvar.
  await dialog.getByRole("button", { name: "Adicionar ação" }).click();

  await dialog.getByRole("button", { name: "Criar automação" }).click();

  await expect(page.getByText("Automação criada.")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name)).toBeVisible();
});
