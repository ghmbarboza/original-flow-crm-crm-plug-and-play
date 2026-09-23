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

  // Respostas com erro do banco aparecem no log do teste (o toast some antes do snapshot).
  page.on("response", async (r) => {
    if (r.url().includes("/rest/v1/appointments") || r.url().includes("/functions/v1/calendar")) console.log("[rede]", r.request().method(), r.status(), r.url().slice(0, 120), r.status() >= 400 ? await r.text().catch(() => "") : "");
  });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 300)); });
  await page.goto("/agenda");
  await expect(page.getByTestId("agenda-page")).toBeVisible();
  await page.getByTestId("agenda-new").click();
  await expect(page.getByTestId("agenda-dialog")).toBeVisible();
  await page.getByTestId("agenda-title").fill(`E2E reunião ${marca}`);
  // Horário único por execução: o dono não pode ter duas reuniões no mesmo horário.
  const inicio = new Date(Date.now() + 3 * 60 * 60_000 + (Number(marca) % 600) * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await page.getByTestId("agenda-start").fill(`${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(inicio.getDate())}T${pad(inicio.getHours())}:${pad(inicio.getMinutes())}`);
  await page.getByTestId("agenda-save").click();
  await expect(page.getByText("Reunião marcada.")).toBeVisible();

  // A tela abre na semana atual (segunda a domingo); se a reunião caiu na próxima, avança.
  const segunda = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
  if (segunda(inicio) > segunda(new Date())) await page.getByRole("button", { name: "Próxima semana" }).click();
  const item = page.getByText(`E2E reunião ${marca}`);
  await expect(item).toBeVisible({ timeout: 15_000 });
  const linha = page.locator("li", { hasText: `E2E reunião ${marca}` });
  await expect(linha).toContainText("Marcada");
  await linha.getByTestId("agenda-cancel").click();
  await expect(linha).toContainText("Cancelada");
});
