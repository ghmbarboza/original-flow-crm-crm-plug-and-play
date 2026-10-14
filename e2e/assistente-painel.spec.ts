import { test, expect } from "@playwright/test";
import { uniqueName } from "./helpers";

/**
 * Painel do assistente: formatação, copiar, tentar de novo e histórico salvo no
 * banco. A resposta da IA é simulada (a qualidade da resposta real é coberta em
 * e2e/hard/assistente.spec.ts); o histórico grava e apaga de verdade.
 */
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const RESPOSTA = [
  "### Funil de hoje",
  "Você tem **3 negócios** abertos, *valor estimado*.",
  "- [Negócios](/deals)",
  "  - etapa ~~antiga~~",
  "| Etapa | Qtd |",
  "|---|---|",
  "| Lead | 2 |",
].join("\n");

test("formata, copia, tenta de novo e guarda a conversa no histórico", async ({ page }) => {
  const pergunta = uniqueName("Pergunta e2e");
  let chamadas = 0;
  await page.route("**/functions/v1/assistente", async (rota) => {
    chamadas += 1;
    if (chamadas === 1) {
      await rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ error: "O assistente está indisponível no momento." }) });
      return;
    }
    await rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, resposta: RESPOSTA }) });
  });

  await page.goto("/dashboard");
  await page.getByTestId("assistente-abrir").click();
  await page.getByTestId("assistente-input").fill(pergunta);
  await page.getByTestId("assistente-enviar").click();

  // Erro: aparece o botão e a nova tentativa traz a resposta.
  await page.getByTestId("assistente-tentar-de-novo").click();
  const resposta = page.getByTestId("assistente-resposta").last();
  await expect(resposta.locator("strong")).toHaveText("3 negócios");
  await expect(resposta.locator("em")).toHaveText("valor estimado");
  await expect(resposta.locator("s")).toHaveText("antiga");
  await expect(resposta.locator("ul ul li")).toHaveText("etapa antiga");
  await expect(resposta.locator("td").first()).toHaveText("Lead");
  await expect(resposta).not.toContainText("**");
  await expect(page.getByTestId("assistente-tentar-de-novo")).toHaveCount(0);
  await expect(page.getByTestId("assistente-resposta")).toHaveCount(1);

  // Copiar a resposta: texto pronto para WhatsApp, com o endereço completo do link.
  await resposta.getByTestId("assistente-copiar").click();
  await expect(resposta.getByTestId("assistente-copiar")).toHaveText("Copiado");
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiado).toContain("Você tem *3 negócios* abertos, _valor estimado_.");
  expect(copiado).toMatch(/• Negócios \(https?:\/\/[^)]+\/deals\)/);

  // Copiar a conversa inteira.
  await page.getByTestId("assistente-copiar-conversa").click();
  const conversa = await page.evaluate(() => navigator.clipboard.readText());
  expect(conversa).toContain(`*Pergunta:* ${pergunta}`);
  expect(conversa).not.toContain("indisponível");

  // Histórico vem do banco: sobrevive a recarregar a página.
  await page.reload();
  await page.getByTestId("assistente-abrir").click();
  await page.getByTestId("assistente-historico").click();
  await page.getByTestId("assistente-busca").fill(pergunta);
  const item = page.getByTestId("assistente-item-historico").filter({ hasText: pergunta });
  await expect(item).toHaveCount(1);
  await item.getByRole("button").first().click();
  await expect(page.getByTestId("assistente-resposta").locator("strong")).toHaveText("3 negócios");

  // Apagar some do banco também.
  await page.getByTestId("assistente-historico").click();
  await page.getByTestId("assistente-busca").fill(pergunta);
  await item.getByRole("button", { name: `Apagar ${pergunta}` }).click();
  await item.getByTestId("assistente-apagar-confirmar").click();
  await expect(item).toHaveCount(0);
  await page.reload();
  await page.getByTestId("assistente-abrir").click();
  await page.getByTestId("assistente-historico").click();
  await expect(page.getByTestId("assistente-lista-historico")).toBeVisible();
  await page.getByTestId("assistente-busca").fill(pergunta);
  await expect(page.getByText("Nenhuma conversa com esse termo.")).toBeVisible();
});
