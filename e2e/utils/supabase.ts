import type { Page } from "@playwright/test";

/**
 * Contexto para chamar a API REST do Supabase com a MESMA sessão autenticada do
 * navegador. A `apikey` (chave anônima, pública) e o token do usuário são
 * capturados de uma requisição real do app — nada é hardcodado/versionado.
 */
export interface SupabaseCtx {
  base: string;
  apikey: string;
  authorization: string;
  orgId: string;
}

export async function supabaseCtx(page: Page): Promise<SupabaseCtx> {
  // Dispara uma request real ao Supabase e captura os headers dela.
  const reqPromise = page.waitForRequest(
    (r) => /\/rest\/v1\//.test(r.url()) && !!r.headers()["apikey"],
    { timeout: 20_000 },
  );
  await page.goto("/contacts");
  const req = await reqPromise;

  const headers = req.headers();
  const apikey = headers["apikey"];
  const authorization = headers["authorization"] ?? `Bearer ${apikey}`;
  const base = new URL(req.url()).origin;

  // org_id a partir do perfil de quem está logado: funciona com a base vazia
  // (antes vinha de um contato existente, e base sem contato travava a suíte).
  const [, payload] = authorization.replace("Bearer ", "").split(".");
  const userId = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string }).sub;
  const resp = await page.request.get(
    `${base}/rest/v1/profiles?select=org_id&id=eq.${userId}&limit=1`,
    { headers: { apikey, Authorization: authorization } },
  );
  const rows = (await resp.json()) as Array<{ org_id: string }>;
  const orgId = rows[0]?.org_id;
  if (!orgId) throw new Error("Não foi possível resolver o org_id pelo perfil da conta logada.");

  return { base, apikey, authorization, orgId };
}

/** Insere uma linha só se ainda não existir uma que bata com `filter` (idempotente). */
async function ensureRow(
  page: Page,
  ctx: SupabaseCtx,
  table: string,
  filter: string,
  insert: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers = {
    apikey: ctx.apikey,
    Authorization: ctx.authorization,
    "Content-Type": "application/json",
  };
  const existing = await page.request.get(
    `${ctx.base}/rest/v1/${table}?${filter}&limit=1`,
    { headers },
  );
  const rows = (await existing.json()) as unknown[];
  if (Array.isArray(rows) && rows.length > 0) return rows[0] as Record<string, unknown>;

  const created = await page.request.post(`${ctx.base}/rest/v1/${table}`, {
    headers: { ...headers, Prefer: "return=representation" },
    data: insert,
  });
  if (!created.ok()) {
    throw new Error(`Seed de ${table} falhou: ${created.status()} ${await created.text()}`);
  }
  const body = (await created.json()) as unknown;
  return (Array.isArray(body) ? body[0] : body) as Record<string, unknown>;
}

/**
 * Garante o mínimo para o inbox do WhatsApp existir e ter uma conversa:
 * config (provider) + instância evolution (destrava o gate `configured`) +
 * uma conversa nova em `ai_active`. Retorna o telefone (usado como nome na lista).
 */
export async function seedWhatsAppInbox(page: Page, ctx: SupabaseCtx): Promise<{ phone: string }> {
  await ensureRow(page, ctx, "messaging_config", `org_id=eq.${ctx.orgId}`, {
    org_id: ctx.orgId,
    provider: "evolution",
  });
  await ensureRow(page, ctx, "evolution_configs", `org_id=eq.${ctx.orgId}&instance_name=eq.e2e-instance`, {
    org_id: ctx.orgId,
    instance_name: "e2e-instance",
    server_url: "https://evolution.e2e.local",
    api_key: "e2e-key",
  });

  const phone = `5511${Date.now().toString().slice(-8)}`;
  await ensureRow(page, ctx, "conversations", `phone_number=eq.${phone}`, {
    org_id: ctx.orgId,
    phone_number: phone,
    provider: "evolution",
    status: "ai_active",
    last_message_preview: "Mensagem de teste e2e",
    last_message_at: new Date().toISOString(),
  });

  return { phone };
}

/** Apaga a conversa semeada (o teardown global só alcança o que leva "E2E" no nome). */
export async function removeSeededConversation(page: Page, ctx: SupabaseCtx, phone: string): Promise<void> {
  const resp = await page.request.delete(
    `${ctx.base}/rest/v1/conversations?org_id=eq.${ctx.orgId}&phone_number=eq.${phone}`,
    { headers: { apikey: ctx.apikey, Authorization: ctx.authorization } },
  );
  if (!resp.ok()) throw new Error(`Limpeza da conversa de teste falhou: ${resp.status()} ${await resp.text()}`);
}
