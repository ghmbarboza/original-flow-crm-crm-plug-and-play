import { test, expect } from "@playwright/test";

/** Sprint 12 B2: Notificações com sub-abas Preferências e Modelos. Devolve o que mudou. */
test("Notificações: preferências mostram o telefone e os eventos de atribuição", async ({ page }) => {
  await page.goto("/settings/notifications");
  await expect(page.getByTestId("notifications-phone-hint")).toBeVisible();
  await expect(page.getByText("Negócio atribuído a mim")).toBeVisible();
  await expect(page.getByText("Conversa atribuída a mim")).toBeVisible();
  await expect(page.getByText("E-mail recebido")).toHaveCount(0);
});

test("Notificações > Modelos: personaliza um evento, vê a prévia e restaura o padrão", async ({ page }) => {
  await page.goto("/settings/notifications?secao=modelos");
  await expect(page.getByTestId("notification-templates")).toBeVisible();

  await page.getByTestId("template-event").click();
  await page.getByRole("option", { name: "Negócio atribuído a mim" }).click();

  const titulo = page.getByTestId("template-title");
  const marca = Date.now().toString().slice(-6);
  await titulo.fill(`Chegou negócio para você, {{user.first_name}} ${marca}`);
  await expect(page.getByTestId("template-preview")).toContainText(`Chegou negócio para você, Ana ${marca}`);
  await page.getByTestId("template-save").click();
  await expect(page.getByText("Modelo salvo.")).toBeVisible();

  await page.reload();
  await page.getByTestId("template-event").click();
  await page.getByRole("option", { name: "Negócio atribuído a mim" }).click();
  await expect(page.getByTestId("template-title")).toHaveValue(`Chegou negócio para você, {{user.first_name}} ${marca}`);

  await page.getByTestId("template-reset").click();
  await expect(page.getByText("Modelo restaurado para o padrão.")).toBeVisible();
  await expect(page.getByTestId("template-title")).toHaveValue("{{title}}");
});
