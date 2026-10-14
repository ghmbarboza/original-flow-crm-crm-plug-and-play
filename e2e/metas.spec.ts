import { test, expect, type Page } from "@playwright/test";
import { supabaseCtx, type SupabaseCtx } from "./utils/supabase";

/**
 * Metas configuráveis: cria uma meta trimestral de taxa de ganho, edita (nome,
 * alvo e período) e exclui com confirmação. O que o teste cria é removido no fim.
 */
test("Metas: cria, edita e exclui uma meta com período e métrica configuráveis", async ({ page }) => {
  const ctx = await supabaseCtx(page);
  const nome = `E2E meta ${Date.now()}`;

  try {
    await page.goto("/sales-goals");
    await expect(page.getByRole("heading", { name: "Metas", level: 1 })).toBeVisible();

    // --- Cria: taxa de ganho, trimestre ---
    await page.getByTestId("meta-nova").click();
    const dialogo = page.getByTestId("meta-dialog");
    await dialogo.getByTestId("meta-metrica").click();
    await page.getByRole("option", { name: "Taxa de ganho" }).click();
    await expect(dialogo.getByText(/Ganhos ÷ \(ganhos \+ perdidos\)/)).toBeVisible();
    await dialogo.getByTestId("meta-periodo-tipo").click();
    await page.getByRole("option", { name: "Trimestre" }).click();
    await expect(dialogo.getByTestId("meta-periodo-rotulo")).toContainText("tri/");
    // Taxa acima de 100% não salva.
    await dialogo.getByTestId("meta-alvo").fill("140");
    await dialogo.getByTestId("meta-salvar").click();
    await expect(page.getByText("Uma taxa vai de 0 a 100%.")).toBeVisible();
    await dialogo.getByTestId("meta-alvo").fill("40");
    await dialogo.getByTestId("meta-salvar").click();
    await expect(page.getByText("Meta criada.")).toBeVisible();

    const cartao = page.getByTestId("sales-goal-card").filter({ hasText: "Taxa de ganho" }).filter({ hasText: "tri/" });
    await expect(cartao).toHaveCount(1);
    await expect(cartao.getByTestId("meta-valores")).toContainText("de 40%");

    // --- Edita: nome, alvo e período (vira mês) ---
    await cartao.getByTestId("meta-editar").click();
    await dialogo.getByTestId("meta-nome").fill(nome);
    await dialogo.getByTestId("meta-alvo").fill("55");
    await dialogo.getByTestId("meta-periodo-tipo").click();
    await page.getByRole("option", { name: "Mês", exact: true }).click();
    await dialogo.getByTestId("meta-salvar").click();
    await expect(page.getByText("Meta atualizada.")).toBeVisible();

    const editado = page.getByTestId("sales-goal-card").filter({ hasText: nome });
    await expect(editado).toBeVisible();
    await expect(editado.getByTestId("meta-valores")).toContainText("de 55%");
    await expect(editado).not.toContainText("tri/");

    // --- Período seguinte na tela: a meta do mês não aparece ---
    await page.getByRole("button", { name: "Próximo período" }).click();
    await expect(page.getByTestId("sales-goal-card").filter({ hasText: nome })).toHaveCount(0);
    await page.getByRole("button", { name: "Período anterior" }).click();

    // --- Exclui com confirmação ---
    await page.getByTestId("sales-goal-card").filter({ hasText: nome }).getByTestId("meta-excluir").click();
    await page.getByTestId("meta-excluir-confirmar").click();
    await expect(page.getByText("Meta excluída.")).toBeVisible();
    await expect(page.getByTestId("sales-goal-card").filter({ hasText: nome })).toHaveCount(0);
  } finally {
    await removerMetasDeTeste(page, ctx, nome);
  }
});

/** Apaga as metas criadas pelo teste (com ou sem o nome dado na edição). */
async function removerMetasDeTeste(page: Page, ctx: SupabaseCtx, nome: string): Promise<void> {
  const headers = { apikey: ctx.apikey, Authorization: ctx.authorization };
  for (const filtro of [`name=eq.${encodeURIComponent(nome)}`, "goal_type=eq.conversion_rate&name=is.null&target_value=eq.40"]) {
    const resp = await page.request.delete(`${ctx.base}/rest/v1/sales_goals?org_id=eq.${ctx.orgId}&${filtro}`, { headers });
    if (!resp.ok()) throw new Error(`Limpeza da meta de teste falhou: ${resp.status()}`);
  }
}
