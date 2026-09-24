import { test, expect } from "@playwright/test";
import { gotoPage, uniqueName } from "./helpers";

test("atividade: a rota antiga leva para Tarefas, que agora cobre todos os tipos", async ({ page }) => {
  const title = uniqueName("Atividade");

  // Unificação de 2026-08-18: /activities e /tasks eram duas telas da mesma
  // tabela. A rota antiga vira redirect, e o filtro de tipo mora na Tarefas.
  await page.goto("/activities");
  await expect(page).toHaveURL(/\/tasks/);

  await page.getByTestId("task-new").click();
  const dialog = page.getByTestId("activity-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#title").fill(title);
  await page.getByTestId("activity-submit").click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText(title)).toBeVisible();
});

test("tarefa: cria e aparece na lista", async ({ page }) => {
  const title = uniqueName("Tarefa");

  await gotoPage(page, "/tasks", "Tarefas");
  await page.getByTestId("task-new").click();

  // Tarefas reusam o formulário de atividade; o tipo já vem em "task".
  const dialog = page.getByTestId("activity-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#title").fill(title);
  await page.getByTestId("activity-submit").click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText(title)).toBeVisible();
});

/**
 * Modo demonstração: popular e limpar.
 *
 * Os dois botões são mutuamente exclusivos por estado (`hasDemoData`), então o
 * teste cobre o ciclo inteiro em vez de tentar cada um isolado — assim ele
 * funciona partindo de qualquer estado inicial e devolve a org como encontrou.
 */
/**
 * Ciclo de demonstração: popular, conferir que os dados aparecem, limpar.
 *
 * Medido: a edge function `demo-data` responde em ~4s tanto no seed quanto no
 * clear. O gargalo não é backend — o timeout generoso abaixo cobre a cascata de
 * refetch que o `invalidateQueries()` sem chave dispara após cada operação.
 */
test("demonstração: popula e limpa os dados", async ({ page }) => {
  test.setTimeout(120_000);

  const abrirAbaDemo = async () => {
    await gotoPage(page, "/settings", "Configurações");
    await page.getByTestId("settings-tab").filter({ hasText: "Primeiros passos" }).click();
    await expect(page.getByTestId("demo-seed")).toBeVisible();
  };

  /**
   * Espera o status de demo resolver.
   *
   * Enquanto a query carrega, `isLoading` deixa os DOIS botões desabilitados.
   * Ramificar antes disso lê o estado errado e leva o teste a pular a limpeza
   * para depois esperar para sempre por um botão que nunca habilita.
   */
  const esperarStatusResolver = async () => {
    await expect(async () => {
      const seedOn = await page.getByTestId("demo-seed").isEnabled();
      const clearOn = await page.getByTestId("demo-clear").isEnabled();
      expect(seedOn || clearOn).toBe(true);
    }).toPass({ timeout: 30_000 });
  };

  await abrirAbaDemo();
  await esperarStatusResolver();

  // Parte de um estado conhecido: se já houver dados de demo, limpa antes.
  // O botão de popular fica desabilitado enquanto existirem dados, então é ele
  // que sinaliza quando a limpeza terminou.
  if (await page.getByTestId("demo-clear").isEnabled()) {
    await page.getByTestId("demo-clear").click();
    await page.getByTestId("demo-clear-confirm").click();
    await expect(page.getByTestId("demo-seed")).toBeEnabled({ timeout: 60_000 });
  }

  // ---- Popular ----
  await page.getByTestId("demo-seed").click();
  // Popular habilita o limpar: é o sinal de que os dados entraram, sem depender
  // do texto do toast.
  await expect(page.getByTestId("demo-clear")).toBeEnabled({ timeout: 60_000 });

  // Os dados aparecem de fato no CRM, não só no estado do botão.
  await gotoPage(page, "/contacts", "Contatos");
  await expect(page.getByTestId("contact-row").first()).toBeVisible();

  // ---- Limpar, devolvendo a org como estava ----
  await abrirAbaDemo();
  await page.getByTestId("demo-clear").click();
  await page.getByTestId("demo-clear-confirm").click();
  await expect(page.getByTestId("demo-seed")).toBeEnabled({ timeout: 60_000 });
});
