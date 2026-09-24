import { test, expect } from "@playwright/test";

/**
 * Configurações novas de 23/09/2026: Ações no funil e Abordagem ativa (aba IA)
 * e Histórico automático (Automações > Funil). Cada teste devolve o que mudou.
 */

test("IA: ações no funil e abordagem ativa salvam e voltam preenchidas", async ({ page }) => {
  await page.goto("/settings/ia");
  await page.getByRole("tab", { name: "Comportamento" }).click();

  const funil = page.getByTestId("funnel-actions");
  await expect(funil).toBeVisible();
  await expect(page.getByTestId("funnel-enabled")).toBeVisible();
  await expect(page.getByTestId("outreach-settings")).toBeVisible();

  // O que a abordagem mostra depende do canal conectado: instrução (Evolution,
  // com o alerta de bloqueio), seletor de template (Meta/Zernio) ou aviso sem canal.
  const instrucaoCampo = page.getByTestId("outreach-instruction");
  const comEvolution = await instrucaoCampo.isVisible();
  if (comEvolution) {
    await expect(page.getByTestId("outreach-evolution-alert")).toContainText(/risco de bloqueio/i);
  } else {
    await expect(
      page.getByTestId("outreach-template").or(page.getByText("Nenhum canal de WhatsApp conectado")),
    ).toBeVisible();
  }

  // Guarda o que estava para devolver no fim.
  const modoAntes = await page.getByTestId("funnel-mode").innerText();
  const instrucaoAntes = comEvolution ? await instrucaoCampo.inputValue() : null;

  await page.getByTestId("funnel-mode").click();
  await page.getByRole("option", { name: /Só sugerir/ }).click();
  const instrucao = `E2E abordagem ${Date.now()}`;
  if (comEvolution) await instrucaoCampo.fill(instrucao);
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(page.getByText("Configuração da IA salva.")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Comportamento" }).click();
  await expect(page.getByTestId("funnel-mode")).toContainText("Só sugerir");
  if (comEvolution) await expect(page.getByTestId("outreach-instruction")).toHaveValue(instrucao);

  // Devolve.
  await page.getByTestId("funnel-mode").click();
  await page.getByRole("option", { name: modoAntes.includes("sugerir") ? /Só sugerir/ : /Mover sozinha/ }).click();
  if (comEvolution && instrucaoAntes !== null) await page.getByTestId("outreach-instruction").fill(instrucaoAntes);
  await page.getByRole("button", { name: "Salvar configuração" }).click();
  await expect(page.getByText("Configuração da IA salva.")).toBeVisible();
});

test("Automações > Funil: histórico automático liga e desliga na hora", async ({ page }) => {
  await page.goto("/settings/automations?secao=funil");
  const bloco = page.getByTestId("historico-settings");
  await expect(bloco).toBeVisible();
  await expect(bloco.getByText("Movimentos feitos pela IA")).toBeVisible();

  const chave = page.getByTestId("historico-ai_notes");
  const estavaLigada = (await chave.getAttribute("aria-checked")) === "true";

  await chave.click();
  await expect(page.getByText(estavaLigada ? "Anotações da IA: deixa de ser registrado." : "Anotações da IA: passa a ser registrado.")).toBeVisible();
  await expect(chave).toHaveAttribute("aria-checked", estavaLigada ? "false" : "true");

  await page.reload();
  await expect(page.getByTestId("historico-ai_notes")).toHaveAttribute("aria-checked", estavaLigada ? "false" : "true");

  // Devolve.
  await page.getByTestId("historico-ai_notes").click();
  await expect(page.getByTestId("historico-ai_notes")).toHaveAttribute("aria-checked", estavaLigada ? "true" : "false");
});
