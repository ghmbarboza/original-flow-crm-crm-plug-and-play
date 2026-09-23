import { test, expect } from "@playwright/test";

/**
 * Sprint 12 B11: Configurações > Agenda (política da IA, lembrete) e página
 * Agenda (nova reunião, cancelar).
 */
test("Configurações > Agenda: salva a política; página Agenda: marca e cancela uma reunião", async ({ page }) => {
  test.setTimeout(120_000);
  const marca = Date.now().toString().slice(-6);

  await page.goto("/settings/agenda");
  await expect(page.getByTestId("agenda-settings")).toBeVisible();
  await expect(page.getByTestId("agenda-calendar")).toBeVisible();
  await expect(page.getByTestId("agenda-policy")).toBeVisible();
  await page.getByTestId("policy-notice").fill("90");
  await page.getByTestId("policy-save").click();
  await expect(page.getByText("Política de agenda salva.")).toBeVisible();

  await page.goto("/agenda");
  await expect(page.getByTestId("agenda-page")).toBeVisible();
  await page.getByTestId("agenda-new").click();
  await expect(page.getByTestId("agenda-dialog")).toBeVisible();
  await page.getByTestId("agenda-title").fill(`E2E reunião ${marca}`);
  const inicio = new Date(Date.now() + 3 * 60 * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await page.getByTestId("agenda-start").fill(`${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(inicio.getDate())}T${pad(inicio.getHours())}:${pad(inicio.getMinutes())}`);
  await page.getByTestId("agenda-save").click();
  await expect(page.getByText("Reunião marcada.")).toBeVisible();

  // A semana exibida pode não ser a da reunião (depois das 21h a reunião cai amanhã, talvez na próxima semana).
  const item = page.getByText(`E2E reunião ${marca}`);
  if (!(await item.isVisible().catch(() => false))) await page.getByRole("button", { name: "Próxima semana" }).click();
  await expect(item).toBeVisible();
  const linha = page.locator("li", { hasText: `E2E reunião ${marca}` });
  await expect(linha).toContainText("Marcada");
  await linha.getByTestId("agenda-cancel").click();
  await expect(linha).toContainText("Cancelada");
});
