import { test, expect } from "@playwright/test";
import { expectNoErrorState, gotoPage } from "./helpers";

/**
 * Cobertura de "a tela abre e funciona" para as áreas sem CRUD próprio.
 *
 * Cada teste confirma o H1 E a ausência de estado de erro. Só o H1 não bastaria:
 * uma página que monta o cabeçalho e quebra no corpo passaria batido.
 */

test.describe("Configurações", () => {
  test("navega por todas as abas sem erro", async ({ page }) => {
    await gotoPage(page, "/settings", "Configurações");

    const tabs = page.getByTestId("settings-tab");
    const count = await tabs.count();
    expect(count).toBeGreaterThan(5);

    // Percorre todas as abas visíveis; o conteúdo de cada uma precisa montar.
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      await tab.click();
      await expect(tab).toHaveAttribute("data-state", "active");
      await expectNoErrorState(page);
    }
  });

  test("salva a configuração geral", async ({ page }) => {
    await gotoPage(page, "/settings", "Configurações");
    await page.getByTestId("settings-tab").filter({ hasText: "Geral" }).click();

    await page.getByTestId("general-save").click();
    await expect(page.getByText(/salv/i).first()).toBeVisible();
  });

  test("altera o modo de distribuição em Canais", async ({ page }) => {
    // Reorganização de 2026-08-03: a aba "Canais" virou um card dentro de
    // Integrações. O deep-link ?integration=channels abre o card já expandido —
    // é o mesmo caminho que os avisos da plataforma usam para trazer o usuário
    // até aqui.
    await gotoPage(page, "/settings/integrations?integration=channels", "Configurações");
    await expect(page.getByTestId("integration-channels")).toBeVisible();
    await page.getByRole("tab", { name: "Distribuição" }).click();

    // Round-robin é o modo que a distribuição por canal do Sprint 8 usa.
    await page.getByTestId("distribution-mode").filter({ hasText: "Round-robin" }).click();
    await page.getByTestId("distribution-save").click();
    await expect(page.getByText("Distribuição atualizada.")).toBeVisible();
  });
});

test.describe("Configurações > Campanhas", () => {
  test("campanhas: abre ou mostra o bloqueio do provedor", async ({ page }) => {
    await gotoPage(page, "/settings/campaigns", "Configurações");
    await expect(page.getByRole("heading", { name: "Campanhas", level: 2 })).toBeVisible();

    // A org pode ou não ter provedor oficial. Os dois desfechos são válidos —
    // o que não pode é a tela quebrar ou ficar ambígua.
    const blocked = page.getByTestId("campaigns-blocked");
    const tabs = page.getByRole("tab", { name: "Campanhas" });
    await expect(blocked.or(tabs).first()).toBeVisible();

    if (await blocked.isVisible()) {
      // Bloqueio precisa explicar o porquê e apontar a saída.
      await expect(blocked).toContainText("provedor oficial");
      await expect(blocked).toContainText("Evolution");
    }
  });

  test("sequências de email abrem sem erro", async ({ page }) => {
    // Reorganização de 2026-08-03: /email-sequences redireciona para a seção
    // Cadências de Configurações > Automações; o título da seção é h3.
    await page.goto("/email-sequences");
    await expect(page).toHaveURL(/\/settings\/automations\?secao=cadencias/);
    await expect(page.getByRole("heading", { name: "Sequências de e-mail", level: 3 })).toBeVisible();
    await expectNoErrorState(page);
  });
});

test.describe("Analytics", () => {
  test("dashboard: filtros de período e canal (Relatórios entrou aqui)", async ({ page }) => {
    // A rota antiga continua levando ao painel.
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/dashboard$/);
    await gotoPage(page, "/dashboard", "Dashboard");
    await expectNoErrorState(page);

    await page.getByTestId("reports-period").click();
    await page.getByRole("option", { name: "Últimos 7 dias" }).click();
    await expect(page.getByTestId("reports-period")).toContainText("Últimos 7 dias");

    // O filtro só lista canais conectados: sem canal, sobra "Todos os canais".
    await page.getByTestId("reports-channel").click();
    const opcoes = page.getByRole("option");
    await expect(opcoes.first()).toHaveText("Todos os canais");
    if ((await opcoes.count()) > 1) {
      const canal = (await opcoes.nth(1).innerText()).trim();
      await opcoes.nth(1).click();
      await expect(page.getByTestId("reports-channel")).toContainText(canal);
    } else {
      await page.keyboard.press("Escape");
    }

    // Trocar filtro refaz a consulta; a página segue de pé.
    await expectNoErrorState(page);
  });

  test("metas abrem sem erro", async ({ page }) => {
    await gotoPage(page, "/sales-goals", "Metas");
    await expectNoErrorState(page);
  });

  test("lead scoring abre sem erro", async ({ page }) => {
    await gotoPage(page, "/lead-scoring", "Lead Scoring");
    await expectNoErrorState(page);
  });
});

test.describe("Atendimento", () => {
  test("inbox: chips de canal e empty state", async ({ page }) => {
    await page.goto("/whatsapp");

    // Sem conversa selecionada, o painel da direita mostra o convite a escolher.
    // Os chips só aparecem quando há mais de um canal em uso — por isso o
    // teste aceita a ausência deles, mas exige o empty state.
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
    await expect(page.getByTestId("inbox-empty")).toContainText("Selecione uma conversa");

    const chips = page.getByTestId("channel-chips");
    if (await chips.count()) {
      await expect(chips).toBeVisible();
    }
  });
});
