import { test, expect } from "@playwright/test";
import { supabaseCtx, type SupabaseCtx } from "./utils/supabase";

/**
 * Canais múltiplos, telas (19/10/2026): a instância conectada vira um cartão
 * em Integrações > Canais, o papel muda pela tela e é gravado, o número pode
 * ser escolhido para os avisos, e a Inbox abre por existir uma conta ativa
 * (não mais por messaging_config.provider).
 */

function headers(ctx: SupabaseCtx, extra: Record<string, string> = {}) {
  return { apikey: ctx.apikey, Authorization: ctx.authorization, "Content-Type": "application/json", ...extra };
}

test("Canais: instância vira conta, papel e avisos mudam pela tela, Inbox abre", async ({ page }) => {
  const ctx = await supabaseCtx(page);
  const nome = `e2e-tela-${Date.now()}`;

  // Instância Evolution direto no banco (RLS: a admin logada pode). O gatilho
  // cria a conta de canal; nada de servidor Evolution envolvido.
  const criada = await page.request.post(`${ctx.base}/rest/v1/evolution_configs`, {
    headers: headers(ctx, { Prefer: "return=representation" }),
    data: {
      org_id: ctx.orgId, instance_name: nome, server_url: "https://evolution.e2e.local",
      api_key: "e2e-key", display_name: `E2E Tela ${nome}`,
      // O evolution-connect grava "connecting" ao gerar o QR; o default da tabela é "disconnected".
      status: "connecting",
    },
  });
  expect(criada.ok(), await criada.text()).toBeTruthy();
  const [instancia] = (await criada.json()) as Array<{ id: string }>;
  let limpeza: string | null = null;

  try {
    const contaResp = await page.request.get(
      `${ctx.base}/rest/v1/channel_accounts?select=id,role,notifications_default&evolution_config_id=eq.${instancia.id}`,
      { headers: headers(ctx) },
    );
    const [conta] = (await contaResp.json()) as Array<{ id: string; role: string }>;
    expect(conta, "o gatilho cria a conta da instância").toBeTruthy();
    expect(conta.role).toBe("ambos");

    await page.goto("/settings/integrations?integration=channels");
    const card = page.getByTestId(`channel-account-${conta.id}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(`E2E Tela ${nome}`);
    await expect(card.getByTestId("status-conta")).toContainText("Aguardando pareamento");

    // Papel pela tela.
    await card.getByTestId("channel-account-role").click();
    await page.getByRole("option", { name: "Só responde" }).click();
    await expect(page.getByText("Conta atualizada.")).toBeVisible();
    const depois = await page.request.get(
      `${ctx.base}/rest/v1/channel_accounts?select=role&id=eq.${conta.id}`,
      { headers: headers(ctx) },
    );
    expect(((await depois.json()) as Array<{ role: string }>)[0].role).toBe("passivo");

    // Número dos avisos.
    await card.getByTestId("channel-account-notifications").click();
    await expect(card.getByTestId("channel-account-notifications-badge")).toBeVisible();
    const avisos = await page.request.get(
      `${ctx.base}/rest/v1/channel_accounts?select=notifications_default&id=eq.${conta.id}`,
      { headers: headers(ctx) },
    );
    expect(((await avisos.json()) as Array<{ notifications_default: boolean }>)[0].notifications_default).toBe(true);

    // Em Notificações o mesmo número aparece selecionado.
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("notifications-account")).toContainText(`E2E Tela ${nome}`);

    // Inbox abre porque existe conta ativa.
    await page.goto("/whatsapp");
    await expect(page.getByRole("heading", { name: "Atendimento", level: 1 })).toBeVisible();
  } finally {
    // Apagar a instância apaga a conta (FK em cascata) e desfaz o padrão dos avisos.
    const del = await page.request.delete(`${ctx.base}/rest/v1/evolution_configs?id=eq.${instancia.id}`, { headers: headers(ctx) });
    if (!del.ok()) limpeza = `Limpeza da instância falhou: ${del.status()} ${await del.text()}`;
  }
  expect(limpeza).toBeNull();
});

test("Canais: sem conta, Integrações mostra o estado vazio com o botão de conectar", async ({ page }) => {
  const ctx = await supabaseCtx(page);
  const contas = await page.request.get(`${ctx.base}/rest/v1/channel_accounts?select=id&limit=1`, { headers: headers(ctx) });
  test.skip(((await contas.json()) as unknown[]).length > 0, "a organização já tem contas: o estado vazio não aparece");

  await page.goto("/settings/integrations?integration=channels");
  await expect(page.getByText("Nenhum canal conectado")).toBeVisible();
  await page.getByTestId("channel-accounts-add").click();
  await expect(page.getByTestId("channel-accounts-wizard")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configurar WhatsApp" })).toBeVisible();
});
