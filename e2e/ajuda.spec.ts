import { test, expect } from "@playwright/test";

/** Central de ajuda: estado da conta, guias com passo a passo, busca e o assistente. */
test("Ajuda: estado da conta, guia em gaveta, busca e assistente", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByTestId("ajuda-page")).toBeVisible();
  await expect(page.getByTestId("ajuda-assistente")).toBeVisible();
  await expect(page.getByTestId("ajuda-status")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("status-canal")).toBeVisible();
  await expect(page.getByTestId("ajuda-como-funciona")).toBeVisible();

  // Guia abre na gaveta com passos e o botão para a tela.
  await page.getByTestId("ajuda-card-agenda").click();
  await expect(page.getByTestId("ajuda-guia")).toBeVisible();
  await expect(page).toHaveURL(/guia=agenda/);
  await expect(page.getByTestId("ajuda-guia-ir")).toHaveAttribute("href", "/agenda");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ajuda-guia")).toHaveCount(0);

  // Busca cobre guias e problemas.
  await page.getByLabel("Buscar na ajuda").fill("twilio");
  await expect(page.getByTestId("ajuda-resultados")).toBeVisible();
  await expect(page.getByTestId("ajuda-card-voz")).toBeVisible();
  await page.getByLabel("Buscar na ajuda").fill("");

  // Assistente: botão flutuante abre o painel com sugestões da tela.
  await page.getByTestId("assistente-abrir").click();
  await expect(page.getByTestId("assistente-painel")).toBeVisible();
  await expect(page.getByTestId("assistente-sugestoes")).toBeVisible();
  await page.getByRole("button", { name: "Fechar o assistente" }).click();
  await expect(page.getByTestId("assistente-abrir")).toBeVisible();
});
