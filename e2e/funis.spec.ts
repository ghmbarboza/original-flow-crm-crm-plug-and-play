import { test, expect, type Page } from "@playwright/test";
import { supabaseCtx, type SupabaseCtx } from "./utils/supabase";

/**
 * Vários funis: cria um segundo funil, confere que o Kanban mostra um funil por
 * vez, que o negócio criado em um não aparece no outro e que funil com negócio
 * não é excluído. Tudo o que o teste cria é removido no fim.
 */
test("Funis: segundo funil tem Kanban próprio e os negócios não se misturam", async ({ page }) => {
  const ctx = await supabaseCtx(page);
  const sufixo = Date.now();
  const funil = `E2E funil ${sufixo}`;
  const negocio = `E2E negócio do funil ${sufixo}`;

  try {
    // --- Cria o funil copiando as etapas do atual ---
    await page.goto("/settings/automations?secao=funil");
    const linhas = page.getByTestId("pipeline-stage-row");
    await expect(linhas.first()).toBeVisible();
    const etapasDoPadrao = await linhas.count();

    await page.getByTestId("funil-novo").click();
    await page.getByTestId("funil-nome").fill(funil);
    await expect(page.getByTestId("funil-copiar-etapas")).toBeChecked();
    await page.getByTestId("funil-form-salvar").click();
    await expect(page.getByText("Funil criado.")).toBeVisible();

    // A tela passa a editar o funil novo, com as mesmas etapas e sem ser o padrão.
    await expect(page.getByTestId("funil-select")).toContainText(funil);
    await expect(linhas).toHaveCount(etapasDoPadrao);
    await expect(page.getByTestId("funil-tornar-padrao")).toBeVisible();

    // --- Kanban: um funil por vez ---
    await page.goto("/deals");
    await expect(page.getByTestId("deals-funil")).toContainText(funil); // lembra o funil aberto
    await expect(page.getByTestId("kanban-column")).toHaveCount(etapasDoPadrao);

    // --- Negócio criado no funil novo ---
    await page.getByTestId("deal-new").click();
    const dialog = page.getByTestId("deal-dialog");
    await expect(dialog.getByTestId("deal-funil")).toContainText(funil);
    // Sem escolher etapa de propósito: tem de cair na primeira etapa DESTE funil,
    // não na do funil padrão (o formulário abre antes de saber o funil ativo).
    await dialog.locator("#title").fill(negocio);
    await dialog.getByTestId("deal-submit").click();
    await expect(page.getByText("Negócio criado.")).toBeVisible();

    const card = page.locator('[data-testid="deal-card"]', { hasText: negocio });
    await expect(card).toBeVisible();

    // No banco, a etapa do negócio é do funil novo.
    const resp = await page.request.get(
      `${ctx.base}/rest/v1/deals?select=id,stage:pipeline_stages(pipeline:pipelines(name))&title=eq.${encodeURIComponent(negocio)}`,
      { headers: { apikey: ctx.apikey, Authorization: ctx.authorization } },
    );
    const [linha] = await resp.json();
    expect(linha.stage.pipeline.name).toBe(funil);

    // --- No funil padrão o negócio não aparece ---
    await page.getByTestId("deals-funil").click();
    await page.getByRole("option").filter({ hasNotText: funil }).first().click();
    await expect(page.getByTestId("kanban-column").first()).toBeVisible();
    await expect(card).toHaveCount(0);

    // --- Ficha do negócio: etapas do funil dele ---
    await page.goto(`/deals/${linha.id}`);
    await expect(page.getByTestId("deal-funil-nome")).toContainText(funil);
    await expect(page.getByTestId("deal-stage-select")).not.toContainText("Sem etapa");

    // --- Funil com negócio não é excluído ---
    // (O Kanban ficou no funil padrão acima, e a tela lembra o último funil aberto.)
    await page.goto("/settings/automations?secao=funil");
    await page.getByTestId("funil-select").click();
    await page.getByRole("option", { name: funil }).click();
    await expect(page.getByTestId("funil-select")).toContainText(funil);
    await page.getByTestId("funil-excluir").click();
    await page.getByTestId("funil-delete-confirmar").click();
    await expect(page.getByText(/Este funil tem negócios/)).toBeVisible();
  } finally {
    await removerFunilDeTeste(page, ctx, funil, negocio);
  }
});

/** Apaga o negócio e o funil criados pelo teste (o funil leva as etapas junto). */
async function removerFunilDeTeste(page: Page, ctx: SupabaseCtx, funil: string, negocio: string): Promise<void> {
  const headers = { apikey: ctx.apikey, Authorization: ctx.authorization };
  const deals = await page.request.delete(
    `${ctx.base}/rest/v1/deals?org_id=eq.${ctx.orgId}&title=eq.${encodeURIComponent(negocio)}`, { headers },
  );
  if (!deals.ok()) throw new Error(`Limpeza do negócio de teste falhou: ${deals.status()}`);
  const funis = await page.request.delete(
    `${ctx.base}/rest/v1/pipelines?org_id=eq.${ctx.orgId}&name=eq.${encodeURIComponent(funil)}&is_default=is.false`, { headers },
  );
  if (!funis.ok()) throw new Error(`Limpeza do funil de teste falhou: ${funis.status()}`);
}
