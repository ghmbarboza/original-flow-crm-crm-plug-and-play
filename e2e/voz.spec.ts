import { test, expect } from "@playwright/test";

/**
 * Sprint 12 B13: página Voz (abas Ligações, Números, Agente de voz, Campanhas).
 * Sem credenciais reais: a tela carrega, as abas trocam e o agente salva.
 */
test("Voz: abas dedicadas carregam e o agente de voz salva a primeira frase", async ({ page }) => {
  test.setTimeout(120_000);
  const marca = Date.now().toString().slice(-6);
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto("/voz");
  await expect(page.getByTestId("voz-page")).toBeVisible();
  await expect(page.getByTestId("voz-ligacoes")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("voz-tab-numeros").click();
  await expect(page.getByTestId("voz-numeros")).toBeVisible();
  await expect(page).toHaveURL(/secao=numeros/);
  await expect(page.getByTestId("voz-credenciais")).toBeVisible();
  // Credenciais não se cadastram aqui: o botão leva para Integrações, onde fica o card do Twilio.
  await page.getByTestId("voz-abrir-integracoes").click();
  await expect(page).toHaveURL(/settings\/integrations\?integration=twilio/);
  await expect(page.getByTestId("integration-twilio-twilio_account_sid")).toBeVisible();
  await expect(page.getByTestId("integration-nylas")).toBeVisible();
  await expect(page.getByTestId("integration-salesforce")).toBeVisible();
  await page.goto("/voz?secao=numeros");

  await page.getByTestId("voz-tab-agente").click();
  await expect(page.getByTestId("voz-agente")).toBeVisible();
  const abertura = page.getByTestId("voz-agente-abertura");
  const original = await abertura.inputValue();
  await abertura.fill(`Oi, aqui é {{agent_name}} da {{company_name}}. E2E ${marca}`);
  await page.getByTestId("voz-agente-salvar").click();
  await expect(page.getByText("Agente salvo. Sincronize para valer nas ligações.")).toBeVisible();
  await page.reload();
  await page.getByTestId("voz-tab-agente").click();
  await expect(page.getByTestId("voz-agente-abertura")).toHaveValue(new RegExp(`E2E ${marca}$`));
  // Volta ao texto anterior para a configuração real não ficar com a marca do teste.
  await page.getByTestId("voz-agente-abertura").fill(original || "Oi, aqui é {{agent_name}} da {{company_name}}. Tudo bem?");
  await page.getByTestId("voz-agente-salvar").click();
  await expect(page.getByText("Agente salvo. Sincronize para valer nas ligações.")).toBeVisible();

  await page.getByTestId("voz-tab-campanhas").click();
  await expect(page.getByTestId("voz-campanhas")).toBeVisible();
  await expect(page.getByTestId("voz-campanha-criar")).toBeDisabled();
});
