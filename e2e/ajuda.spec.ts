import { test, expect } from "@playwright/test";

/** Ajuda: cobre as funcionalidades da Sprint 12 e a busca filtra as seções. */
test("Ajuda: seções novas aparecem e a busca filtra", async ({ page }) => {
  await page.goto("/help");
  for (const titulo of ["Conhecimento da IA", "Voz e ligações", "Agenda", "Importação e migração", "Produtos/Serviços", "Integrações e credenciais"]) {
    await expect(page.getByText(titulo, { exact: true }).first()).toBeVisible();
  }
  await page.getByPlaceholder(/buscar|pesquisar|procurar/i).fill("Twilio");
  await expect(page.getByText("Voz e ligações", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Contatos e Empresas", { exact: true })).toHaveCount(0);
});
