import { test, expect } from "@playwright/test";

/**
 * Sprint 12 B13: página Voz. Sem credenciais e número conectados, a página só
 * orienta (mesmo padrão do Email): estado vazio com o próximo passo e o link para
 * Configurações > Integrações, onde ficam as credenciais do Twilio e do ElevenLabs.
 */
test("Voz: sem conexão mostra só a orientação; o link abre o card do Twilio em Integrações", async ({ page }) => {
  test.setTimeout(120_000);
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto("/voz");
  await expect(page.getByTestId("voz-page")).toBeVisible();
  // Ou falta credencial (passo 1) ou falta número (passo 2); nunca as abas.
  const passo1 = page.getByTestId("voz-abrir-integracoes");
  const passo2 = page.getByTestId("voz-conectar-numero");
  await expect(passo1.or(passo2)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("voz-tab-ligacoes")).toHaveCount(0);

  if (await passo1.isVisible()) {
    await passo1.click();
  } else {
    await expect(page.getByTestId("voz-importar")).toBeDisabled();
    await page.getByRole("link", { name: /Rever credenciais/ }).click();
  }
  await expect(page).toHaveURL(/settings\/integrations\?integration=twilio/);
  await expect(page.getByTestId("integration-twilio-twilio_account_sid")).toBeVisible();
  await expect(page.getByTestId("integration-nylas")).toBeVisible();
  await expect(page.getByTestId("integration-salesforce")).toBeVisible();
  await expect(page.getByTestId("integration-elevenlabs")).toBeVisible();
});
