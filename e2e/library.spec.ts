import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gotoPage } from "./helpers";

/**
 * Biblioteca de Modelos (/library).
 *
 * A ativação escreve na organização real, e os registros criados NÃO levam o
 * marcador "E2E" que o global-teardown usa (o nome vem do título do modelo). Por
 * isso este spec limpa o que cria, comparando ids antes e depois — mesma trava
 * que o spec do wizard passou a usar.
 *
 * Só ativa modelos da categoria `email_template`: é a única cujo efeito é uma
 * linha isolada, sem tocar em configuração única por org. Ativar `followup`
 * substituiria a régua da organização, e isso não cabe num teste automatizado.
 */

function fromDotenv(key: string): string | undefined {
  try {
    const line = readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

function env(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k] ?? fromDotenv(k);
    if (v) return v;
  }
  return undefined;
}

let db: SupabaseClient;
let orgId: string;
let templateIdsAntes = new Set<string>();

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  const password = process.env.E2E_PASSWORD;
  expect(url, "SUPABASE_URL ausente").toBeTruthy();
  expect(password, "E2E_PASSWORD ausente").toBeTruthy();

  db = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({
    email: process.env.E2E_EMAIL ?? "sabrina@viverdeia.ai",
    password: password!,
  });
  expect(error, `login falhou: ${error?.message}`).toBeNull();

  const { data: profile } = await db
    .from("profiles").select("org_id").eq("id", auth!.user!.id).maybeSingle();
  orgId = profile!.org_id as string;

  const { data: antes } = await db.from("email_templates").select("id").eq("org_id", orgId);
  templateIdsAntes = new Set((antes ?? []).map((r) => r.id as string));
});

test.afterAll(async () => {
  if (!db || !orgId) return;
  const { data: depois } = await db.from("email_templates").select("id").eq("org_id", orgId);
  const novos = (depois ?? []).map((r) => r.id as string).filter((id) => !templateIdsAntes.has(id));
  if (novos.length) await db.from("email_templates").delete().in("id", novos);
  // Escopo local de propósito: o signOut padrão do Supabase é GLOBAL e revoga
  // todas as sessões do usuário, inclusive a que o navegador carrega de
  // e2e/.auth/user.json. As chamadas REST seguem funcionando (JWT é verificado
  // stateless), mas as edge functions validam o token com getUser contra o
  // servidor de auth e passam a responder 401 — quebrando specs posteriores por
  // um motivo que não tem nada a ver com eles.
  await db.auth.signOut({ scope: "local" });
});

test("biblioteca lista os modelos e filtra por categoria", async ({ page }) => {
  await gotoPage(page, "/library", "Biblioteca de Modelos");

  const cards = page.getByTestId("library-card");
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThan(0);

  // Filtrar reduz (ou mantém) o conjunto, e nunca mostra outra categoria.
  await page.getByTestId("library-filtro-email_sequence").click();
  await expect(cards.first()).toBeVisible();
  const sequencias = await cards.count();
  expect(sequencias).toBeGreaterThan(0);
  expect(sequencias).toBeLessThanOrEqual(total);
  for (const texto of await cards.allTextContents()) {
    expect(texto).toContain("Sequências de Email");
  }

  await page.getByTestId("library-filtro-todos").click();
  await expect(cards).toHaveCount(total);
});

test("preview mostra o conteúdo do modelo antes de qualquer ação", async ({ page }) => {
  await gotoPage(page, "/library", "Biblioteca de Modelos");
  await page.getByTestId("library-filtro-email_sequence").click();

  await page.getByTestId("library-ver-modelo").first().click();
  const dialog = page.getByTestId("library-preview");
  await expect(dialog).toBeVisible();
  // Sequência: as etapas aparecem com prazo e assunto.
  await expect(dialog).toContainText("Etapa 1");
  await expect(dialog).toContainText("Assunto:");
  await expect(page.getByTestId("library-usar")).toBeVisible();
});

test("follow-up avisa que substitui a configuração da organização", async ({ page }) => {
  await gotoPage(page, "/library", "Biblioteca de Modelos");
  await page.getByTestId("library-filtro-followup").click();
  await page.getByTestId("library-ver-modelo").first().click();

  // Único caso destrutivo da Biblioteca: o aviso é obrigatório.
  await expect(page.getByTestId("library-aviso-substitui")).toBeVisible();
});

test("usar um modelo cria a cópia com from_template_id e leva ao editor", async ({ page }) => {
  await gotoPage(page, "/library", "Biblioteca de Modelos");
  await page.getByTestId("library-filtro-email_template").click();

  const primeiro = page.getByTestId("library-card").first();
  const titulo = (await primeiro.locator("p").first().textContent())?.trim() ?? "";
  await primeiro.getByTestId("library-ver-modelo").click();
  await page.getByTestId("library-usar").click();

  // Navega para a lista onde o item criado aparece.
  await expect(page).toHaveURL(/\/email-templates/);

  // O registro nasceu do modelo — é o que os analytics futuros vão usar.
  await expect(async () => {
    const { data } = await db
      .from("email_templates")
      .select("id, name, subject, from_template_id")
      .eq("org_id", orgId)
      .not("from_template_id", "is", null);
    expect(data!.length).toBeGreaterThan(0);
    const criado = data!.find((t) => titulo.includes(t.name as string));
    expect(criado, `nenhum template com nome contido em "${titulo}"`).toBeTruthy();
    expect(criado!.subject).toBeTruthy();
  }).toPass({ timeout: 10_000 });
});

test("empty state de sequências aponta para a Biblioteca", async ({ page }) => {
  // Não força o empty state: se a org tiver sequências, o link não existe e o
  // teste não tem o que afirmar. Documenta a integração quando ela é visível.
  await gotoPage(page, "/email-sequences", "Sequências de email");
  const link = page.getByTestId("link-biblioteca");
  if (await link.count()) {
    await link.first().click();
    await expect(page).toHaveURL(/\/library\?categoria=email_sequence/);
    await expect(page.getByTestId("library-filtro-email_sequence")).toBeVisible();
  } else {
    test.skip(true, "a org já tem sequências; empty state não visível");
  }
});
