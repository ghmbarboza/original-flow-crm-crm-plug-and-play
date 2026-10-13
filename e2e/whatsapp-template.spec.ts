import { test, expect, type Page } from "@playwright/test";
import { supabaseCtx, type SupabaseCtx } from "./utils/supabase";
import { uniqueName } from "./helpers";

/**
 * Janela de 24h do WhatsApp oficial: quando ela fecha, o campo de texto dá
 * lugar ao envio de template, com o nome da pessoa já preenchido.
 *
 * A org de teste usa Evolution, então o provedor oficial é simulado na borda:
 * a leitura de `messaging_config`/`meta_configs` e as duas functions são
 * interceptadas. Conversa, contato e mensagens são reais (e apagados no fim).
 */

const DOIS_DIAS_MS = 48 * 60 * 60 * 1000;

const TEMPLATES = [
  { id: "1", name: "retomada_pedido", status: "APPROVED", category: "UTILITY", language: "pt_BR", body_text: "Olá {{1}}, seu pedido {{2}} está pronto.", param_count: 2 },
  { id: "2", name: "volta_contato", status: "APPROVED", category: "MARKETING", language: "pt_BR", body_text: "Oi {{1}}! Podemos continuar a conversa?", param_count: 1 },
  { id: "3", name: "em_revisao", status: "PENDING", category: "UTILITY", language: "pt_BR", body_text: "Ainda não aprovado", param_count: 0 },
];

function cabecalhos(ctx: SupabaseCtx) {
  return { apikey: ctx.apikey, Authorization: ctx.authorization, "Content-Type": "application/json" };
}

async function inserir(page: Page, ctx: SupabaseCtx, tabela: string, linha: Record<string, unknown>) {
  const resp = await page.request.post(`${ctx.base}/rest/v1/${tabela}`, {
    headers: { ...cabecalhos(ctx), Prefer: "return=representation" },
    data: linha,
  });
  if (!resp.ok()) throw new Error(`Seed de ${tabela} falhou: ${resp.status()} ${await resp.text()}`);
  return ((await resp.json()) as Array<{ id: string }>)[0];
}

async function apagar(page: Page, ctx: SupabaseCtx, tabela: string, filtro: string) {
  const resp = await page.request.delete(`${ctx.base}/rest/v1/${tabela}?${filtro}`, { headers: cabecalhos(ctx) });
  expect(resp.ok(), `limpeza de ${tabela}: ${resp.status()}`).toBe(true);
}

/** Faz a tela enxergar a org como conectada pela API Oficial (Meta). */
async function simularProvedorOficial(page: Page, ctx: SupabaseCtx) {
  await page.route("**/rest/v1/messaging_config*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const resp = await route.fetch();
    const corpo = await resp.json();
    const linha = Array.isArray(corpo) ? corpo[0] : corpo;
    const ajustada = { ...linha, org_id: ctx.orgId, provider: "meta_official" };
    await route.fulfill({ response: resp, status: 200, json: Array.isArray(corpo) ? [ajustada] : ajustada });
  });
  await page.route("**/rest/v1/meta_configs*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      json: { id: "00000000-0000-0000-0000-0000000000e2", org_id: ctx.orgId, is_active: true, phone_number_id: "e2e", business_account_id: "e2e" },
    });
  });
  await page.route("**/functions/v1/message-templates", (route) =>
    route.fulfill({ status: 200, json: { provider: "meta_official", templates: TEMPLATES } }));
}

test("janela de 24h fechada: envia template com o nome da conversa já preenchido", async ({ page }) => {
  const ctx = await supabaseCtx(page);
  const sobrenome = uniqueName("Souza");
  const telefone = `5511${Date.now().toString().slice(-8)}`;

  const contato = await inserir(page, ctx, "contacts", {
    org_id: ctx.orgId, first_name: "Marina", last_name: sobrenome, whatsapp_phone: telefone,
  });
  const conversa = await inserir(page, ctx, "conversations", {
    org_id: ctx.orgId, phone_number: telefone, provider: "meta_official", channel: "whatsapp",
    contact_id: contato.id, status: "human_takeover",
    last_message_preview: "Oi, quero saber do pedido", last_message_at: new Date().toISOString(),
  });
  await inserir(page, ctx, "conversation_messages", {
    conversation_id: conversa.id, org_id: ctx.orgId, direction: "inbound", type: "text", status: "received",
    content: "Oi, quero saber do pedido", sent_at: new Date(Date.now() - DOIS_DIAS_MS).toISOString(),
  });

  try {
    await simularProvedorOficial(page, ctx);
    let enviado: Record<string, unknown> | null = null;
    await page.route("**/functions/v1/send-template-message", async (route) => {
      enviado = route.request().postDataJSON();
      await route.fulfill({ status: 200, json: { ok: true, provider_message_id: "wamid.E2E" } });
    });

    await page.goto(`/whatsapp?conversa=${conversa.id}`);
    // A Inbox monta o painel duas vezes (computador e celular, um escondido por
    // CSS); o primeiro é o visível no tamanho de tela do teste.
    const painel = page.locator("div.via-card > div.hidden.md\\:block");

    // Janela fechada: sem campo de texto livre, só o caminho do template.
    await expect(painel.getByTestId("inbox-janela-fechada")).toBeVisible();
    await expect(painel.getByPlaceholder(/Escreva uma mensagem/)).toHaveCount(0);

    // Nota interna não sai para o cliente, então continua disponível.
    await painel.getByRole("button", { name: "Nota interna" }).click();
    await expect(painel.getByPlaceholder("Escreva uma nota interna…")).toBeVisible();
    await painel.getByRole("button", { name: "Nota interna" }).click();

    await painel.getByTestId("inbox-enviar-template").click();
    await page.getByTestId("template-select").click();
    // Só os aprovados aparecem na lista.
    await expect(page.getByRole("option", { name: /em_revisao/ })).toHaveCount(0);
    await page.getByRole("option", { name: /retomada_pedido/ }).click();

    // {{1}} vem depois de "Olá": já chega com o primeiro nome do contato.
    await expect(page.getByTestId("template-param-1")).toHaveValue("Marina");
    // {{2}} não é nome: fica em branco e trava o envio até ser preenchida.
    await expect(page.getByTestId("template-param-2")).toHaveValue("");
    await expect(page.getByTestId("template-enviar")).toBeDisabled();

    await page.getByTestId("template-param-2").fill("A-7");
    await expect(page.getByTestId("template-previa")).toHaveText("Olá Marina, seu pedido A-7 está pronto.");

    await page.getByTestId("template-enviar").click();
    await expect(page.getByText("Template enviado.")).toBeVisible();
    await expect(page.getByTestId("template-dialog")).toHaveCount(0);
    expect(enviado).toEqual({
      conversation_id: conversa.id,
      template_name: "retomada_pedido",
      template_language: "pt_BR",
      params: ["Marina", "A-7"],
    });

    // Cliente respondeu: a janela reabre e o texto livre volta. O botão de
    // template continua à mão para quem quiser usar um mesmo assim.
    await inserir(page, ctx, "conversation_messages", {
      conversation_id: conversa.id, org_id: ctx.orgId, direction: "inbound", type: "text", status: "received",
      content: "Pode mandar", sent_at: new Date().toISOString(),
    });
    await page.reload();
    await expect(painel.getByPlaceholder(/Escreva uma mensagem/)).toBeVisible();
    await expect(painel.getByTestId("inbox-janela-fechada")).toHaveCount(0);
    await expect(painel.getByTestId("inbox-template")).toBeVisible();
  } finally {
    await apagar(page, ctx, "conversation_messages", `conversation_id=eq.${conversa.id}`);
    await apagar(page, ctx, "conversations", `id=eq.${conversa.id}`);
    await apagar(page, ctx, "contacts", `id=eq.${contato.id}`);
  }
});
