import { test, expect } from "@playwright/test";
import { supabaseCtx } from "./utils/supabase";

/**
 * Configurações > Automações > Funil: as etapas são editáveis na tela (criar,
 * reordenar, renomear, excluir). O teste cria uma etapa própria e a remove no
 * fim, mesmo se falhar no meio, para o funil voltar ao que era.
 */
test("Funil: cria, reordena, renomeia e exclui uma etapa", async ({ page }) => {
  const ctx = await supabaseCtx(page);
  const nome = `E2E etapa ${Date.now()}`;
  const renomeada = `${nome} editada`;

  try {
    await page.goto("/settings/automations?secao=funil");
    const linhas = page.getByTestId("pipeline-stage-row");
    await expect(linhas.first()).toBeVisible();
    const antes = await linhas.count();
    const primeiraEtapa = (await linhas.first().locator("span.font-medium").innerText()).trim();

    // Nome repetido não salva.
    await page.getByTestId("pipeline-stage-nova").click();
    await page.getByTestId("stage-name").fill(primeiraEtapa.toLowerCase());
    await expect(page.getByText("Já existe uma etapa com esse nome.")).toBeVisible();
    await expect(page.getByTestId("stage-form-salvar")).toBeDisabled();

    // Cria no fim do funil. Sem probabilidade escolhida não salva.
    await page.getByTestId("stage-name").fill(nome);
    await expect(page.getByTestId("stage-form-salvar")).toBeDisabled();
    await page.getByTestId("stage-probability").fill("40");
    await page.getByTestId("stage-form-salvar").click();
    await expect(page.getByText("Etapa criada.")).toBeVisible();
    await expect(linhas).toHaveCount(antes + 1);
    await expect(linhas.nth(antes)).toContainText(nome);

    // Sobe uma posição e a ordem continua depois de recarregar.
    // A tela troca a ordem na hora; espera o banco confirmar antes de recarregar.
    const gravacao = page.waitForResponse((r) => r.url().includes("/rpc/reorder_pipeline_stages"));
    await page.getByTestId(`pipeline-stage-subir-${antes}`).click();
    await expect(linhas.nth(antes - 1)).toContainText(nome);
    expect((await gravacao).status()).toBe(204);
    await page.reload();
    await expect(linhas.nth(antes - 1)).toContainText(nome);

    // A coluna aparece no Kanban, na posição nova.
    await page.goto("/deals");
    await expect(page.getByTestId("kanban-column").nth(antes - 1)).toContainText(nome);

    // Renomeia.
    await page.goto("/settings/automations?secao=funil");
    await page.getByTestId(`pipeline-stage-editar-${antes - 1}`).click();
    await page.getByTestId("stage-name").fill(renomeada);
    await page.getByTestId("stage-form-salvar").click();
    await expect(page.getByText("Etapa atualizada.")).toBeVisible();
    await expect(linhas.nth(antes - 1)).toContainText(renomeada);

    // Exclui (etapa vazia) e o funil volta ao tamanho de antes.
    await page.getByTestId(`pipeline-stage-excluir-${antes - 1}`).click();
    await page.getByTestId("stage-delete-confirmar").click();
    await expect(page.getByText("Etapa excluída.")).toBeVisible();
    await expect(linhas).toHaveCount(antes);
    await expect(page.getByText(renomeada)).toHaveCount(0);
  } finally {
    const resp = await page.request.delete(
      `${ctx.base}/rest/v1/pipeline_stages?org_id=eq.${ctx.orgId}&name=like.${encodeURIComponent(`${nome}*`)}`,
      { headers: { apikey: ctx.apikey, Authorization: ctx.authorization } },
    );
    if (!resp.ok()) throw new Error(`Limpeza da etapa de teste falhou: ${resp.status()}`);
  }
});
