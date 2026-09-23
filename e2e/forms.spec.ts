import { test, expect } from "@playwright/test";

/**
 * Sprint 12 B3: formulário com lista de opções, campo condicional, UTM na URL e
 * código de embed. Cria pela tela, envia pela página pública e confere o contato.
 */
test("Formulários: campo condicional, origem por UTM e embed", async ({ page }) => {
  test.setTimeout(120_000);
  const marca = Date.now().toString().slice(-6);
  const slug = `e2e-form-${marca}`;

  await page.goto("/settings/capture");
  await page.getByRole("button", { name: "Novo formulário" }).click();
  await page.locator("#cf-name").fill(`E2E Form ${marca}`);
  await page.locator("#cf-slug").fill(slug);

  // Campo 3: lista de opções. Campo 4: número, só quando a lista for "Plano anual".
  await page.getByRole("button", { name: "Adicionar" }).click();
  const linhas = page.locator('[placeholder="Rótulo"]');
  await linhas.nth(2).fill("Interesse");
  await page.locator('[placeholder="chave"]').nth(2).fill("interesse");
  await page.getByTestId("campo-tipo-2").click();
  await page.getByRole("option", { name: "Lista de opções" }).click();
  await page.getByTestId("campo-opcoes-2").fill("Plano mensal, Plano anual");

  await page.getByRole("button", { name: "Adicionar" }).click();
  await linhas.nth(3).fill("Quantos usuários");
  await page.locator('[placeholder="chave"]').nth(3).fill("usuarios");
  await page.getByTestId("campo-condicao-3").click();
  await page.getByRole("option", { name: "Interesse" }).click();
  await page.getByTestId("campo-condicao-valor-3").fill("Plano anual");

  await page.getByRole("button", { name: "Criar formulário" }).click();
  await expect(page.getByText("Formulário criado.")).toBeVisible();
  await expect(page.getByText(`/f/${slug}`)).toBeVisible();

  // Embed disponível.
  await page.getByRole("button", { name: "Código de embed" }).last().click();
  await expect(page.getByTestId("embed-script")).toContainText(`capture-form-embed?form=${slug}`);
  await page.keyboard.press("Escape");

  // Página pública com UTM: o campo condicional aparece só com "Plano anual".
  await page.goto(`/f/${slug}?utm_source=Meta%20Ads&utm_campaign=setembro`);
  await expect(page.getByTestId("public-form")).toBeVisible();
  await page.getByTestId("campo-name").fill(`Lead E2E ${marca}`);
  await page.getByTestId("campo-email").fill(`lead-${marca}@exemplo.com.br`);
  await expect(page.getByTestId("campo-usuarios")).toHaveCount(0);
  await page.getByTestId("campo-interesse").click();
  await page.getByRole("option", { name: "Plano anual" }).click();
  await expect(page.getByTestId("campo-usuarios")).toBeVisible();
  await page.getByTestId("form-submit").click();
  await expect(page.getByTestId("form-error")).toContainText("Quantos usuários");
  await page.getByTestId("campo-usuarios").fill("12");
  await page.getByTestId("form-submit").click();
  await expect(page.getByTestId("form-done")).toBeVisible();

  // Contato com origem meta_ads e campos extras.
  await page.goto("/contacts");
  await page.getByPlaceholder(/buscar/i).first().fill(`lead-${marca}`);
  await expect(page.getByText(`Lead E2E ${marca}`)).toBeVisible();
  await page.getByText(`Lead E2E ${marca}`).first().click();
  await expect(page.getByText("meta_ads")).toBeVisible();

  // Contagem de envios na lista.
  await page.goto("/settings/capture");
  await expect(page.getByTestId(`form-envios-${slug}`)).toContainText("1 envio");
});
