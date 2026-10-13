import { test, expect } from "@playwright/test";

/**
 * Configurações > Integrações > IA: o card mostra a ordem de uso dos provedores
 * e os campos de chave própria. Não cadastra chave: uma chave de teste entraria
 * na frente da fila de atendimento da conta.
 */
test("Integrações: card de IA mostra a fila de provedores e os campos de chave", async ({ page }) => {
  await page.goto("/settings/integrations?integration=ia");

  const fila = page.getByTestId("integration-ia-fila");
  await expect(fila).toBeVisible();
  await expect(fila.getByRole("listitem").last()).toHaveText("IA da plataforma (reserva)");

  for (const servico of ["anthropic", "openai", "gemini"]) {
    await expect(page.getByTestId(`integration-ia-${servico}`)).toBeVisible();
  }
  // Sem nada digitado não há o que salvar.
  await expect(page.getByTestId("integration-ia-salvar")).toBeDisabled();
});
