import type { Locator, Page } from "@playwright/test";

/**
 * Executa um drag-and-drop HTML5 NATIVO (dragstart/dragover/drop), que o
 * `locator.dragTo()` do Playwright não dispara (ele usa eventos de mouse).
 * O Kanban de deals usa DnD nativo, então despachamos os eventos com um
 * DataTransfer compartilhado, como o navegador faria.
 */
export async function nativeDragTo(page: Page, source: Locator, target: Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
  await dataTransfer.dispose();
}
