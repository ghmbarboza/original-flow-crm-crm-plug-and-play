import { test, expect } from "@playwright/test";

// Navegação pelo sidebar: clica cada item e confirma a rota (e o título quando conhecido).
const ITEMS = [
  { link: "Contatos", url: /\/contacts$/, heading: "Contatos" },
  { link: "Empresas", url: /\/companies$/, heading: "Empresas" },
  { link: "Negócios", url: /\/deals$/, heading: "Negócios" },
  { link: "WhatsApp", url: /\/whatsapp$/, heading: null },
  { link: "Configurações", url: /\/settings/, heading: "Configurações" },
] as const;

test.describe("navegação pelo sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  });

  for (const item of ITEMS) {
    test(`vai para ${item.link}`, async ({ page }) => {
      await page.getByRole("link", { name: item.link, exact: true }).click();
      await expect(page).toHaveURL(item.url);
      if (item.heading) {
        await expect(page.getByRole("heading", { name: item.heading, level: 1 })).toBeVisible();
      }
    });
  }
});
