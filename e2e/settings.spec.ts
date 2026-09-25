import { test, expect } from "@playwright/test";

test("configurações: troca de aba e salva", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toBeVisible();

  // Trocar de aba muda a rota (não é só estado local).
  await page.getByRole("tab", { name: "Notificações" }).click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);

  await page.getByRole("tab", { name: "Geral" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  // Salvar na aba Geral: altera o telefone (campo pouco sensível) e salva.
  const phoneField = page.locator("#full_name");
  await expect(phoneField).not.toHaveValue(""); // garante que o perfil já carregou
  // Altera o telefone e DEVOLVE o original: a versão antiga deixava um número
  // aleatório no perfil real a cada execução.
  const telefone = page.locator("#phone");
  const original = await telefone.inputValue();
  await telefone.fill(`(11) 9${Date.now().toString().slice(-8)}`);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Informações atualizadas com sucesso.")).toBeVisible();

  await telefone.fill(original);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Informações atualizadas com sucesso.").last()).toBeVisible();
  await page.reload();
  await expect(page.locator("#phone")).toHaveValue(original);
});
