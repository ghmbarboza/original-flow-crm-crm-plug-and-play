import { test, expect } from "@playwright/test";

/** Sprint 12 B1: aba E-mail (Resend e Gmail). Devolve o que mudou. */
test("Configurações > E-mail: escolhe provedor, salva remetente e mostra Resend e Gmail", async ({ page }) => {
  await page.goto("/settings/email");
  await expect(page.getByTestId("email-settings")).toBeVisible();
  await expect(page.getByTestId("resend-section")).toBeVisible();
  await expect(page.getByTestId("gmail-section")).toBeVisible();

  const nome = page.getByTestId("email-from-name");
  const email = page.getByTestId("email-from-email");
  const nomeAntes = await nome.inputValue();
  const emailAntes = await email.inputValue();
  const provedorResendAntes = (await page.getByTestId("email-provider-resend").getAttribute("aria-checked")) === "true";

  const marca = Date.now().toString().slice(-6);
  await page.getByTestId("email-provider-resend").click();
  await nome.fill(`Equipe E2E ${marca}`);
  await email.fill(`e2e-${marca}@exemplo.com.br`);
  await page.getByTestId("email-save").click();
  await expect(page.getByText("Configuração de e-mail salva.")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("email-provider-resend")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("email-from-name")).toHaveValue(`Equipe E2E ${marca}`);
  await expect(page.getByTestId("email-from-email")).toHaveValue(`e2e-${marca}@exemplo.com.br`);

  // Devolve.
  await page.getByTestId(provedorResendAntes ? "email-provider-resend" : "email-provider-gmail").click();
  await page.getByTestId("email-from-name").fill(nomeAntes);
  await page.getByTestId("email-from-email").fill(emailAntes);
  await page.getByTestId("email-save").click();
  await expect(page.getByText("Configuração de e-mail salva.")).toBeVisible();
});

test("Integrações: o card de e-mail leva para a aba E-mail", async ({ page }) => {
  await page.goto("/settings/integrations?integration=gmail");
  await page.getByTestId("integration-gmail-open").click();
  await expect(page).toHaveURL(/\/settings\/email$/);
  await expect(page.getByTestId("email-settings")).toBeVisible();
});
