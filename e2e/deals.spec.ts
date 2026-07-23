import { test, expect } from "@playwright/test";
import { nativeDragTo } from "./utils/dnd";

test("cria um negócio e move no kanban", async ({ page }) => {
  await page.goto("/deals");
  await expect(page.getByRole("heading", { name: "Negócios", level: 1 })).toBeVisible();

  const title = `Negócio E2E ${Date.now()}`;

  // --- Criar ---
  await page.getByRole("button", { name: "Novo negócio" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Novo negócio" })).toBeVisible();

  // Seleciona uma etapa explicitamente. Isso (a) evita a corrida do default
  // assíncrono de etapa — sem etapa o deal nasce sem stage_id e não aparece no
  // kanban — e (b) garante que os efeitos de reset do formulário já rodaram
  // antes de preenchermos os campos.
  await dialog.locator("#stage").click();
  await page.getByRole("option").first().click();

  await dialog.locator("#value").fill("1000");
  await dialog.locator("#title").fill(title); // título por último, após o reset do form
  await dialog.getByRole("button", { name: "Criar negócio" }).click();

  await expect(page.getByText("Negócio criado.")).toBeVisible();
  await expect(dialog).toBeHidden();

  // O card entra no kanban (na primeira etapa do pipeline por padrão).
  const card = page.locator('[data-testid="deal-card"]', { hasText: title });
  await expect(card).toBeVisible();

  // --- Mover no kanban ---
  const columns = page.locator('[data-testid="kanban-column"]');
  const columnCount = await columns.count();
  expect(columnCount).toBeGreaterThan(1); // precisa de ao menos 2 etapas para mover

  // Origem: coluna que contém o card. Destino: a primeira coluna de etapa diferente.
  const sourceColumn = columns.filter({ has: card });
  const sourceStage = await sourceColumn.getAttribute("data-stage-id");

  let targetColumn = columns.nth(1);
  let targetName: string | null = null;
  for (let i = 0; i < columnCount; i++) {
    const col = columns.nth(i);
    if ((await col.getAttribute("data-stage-id")) !== sourceStage) {
      targetColumn = col;
      targetName = await col.getAttribute("data-stage-name");
      break;
    }
  }

  await nativeDragTo(page, card, targetColumn);

  // Após mover, o card deve estar DENTRO da coluna destino.
  await expect(
    targetColumn.locator('[data-testid="deal-card"]', { hasText: title }),
  ).toBeVisible();

  // eslint-disable-next-line no-console
  console.log(`Deal "${title}" movido para a etapa "${targetName}".`);
});
