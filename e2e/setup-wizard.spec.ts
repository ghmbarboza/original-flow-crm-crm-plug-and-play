import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Wizard de configuração inicial (/setup).
 *
 * Este spec é a exceção da suíte: todos os outros rodam com a organização já
 * configurada (ver e2e/global-setup.ts), enquanto este precisa do estado
 * oposto. Por isso ele reverte `setup_completed` no início e restaura no fim,
 * junto com todo o contexto da empresa e as etapas do pipeline.
 *
 * A restauração não é cortesia: a suíte roda contra o backend real e há uma
 * única organização. Sem restaurar, um run deste spec deixaria a empresa do
 * usuário com dados de teste e o pipeline substituído.
 *
 * DEPENDÊNCIA EXTERNA NO PASSO 3: a geração do system prompt chama a edge
 * function generate-system-prompt, que exige ANTHROPIC_API_KEY. O passo 3 não
 * tem caminho manual nem "pular" — o botão de avançar é `disabled` enquanto não
 * houver blocos gerados. Então, quando a chave não está configurada, o wizard
 * fica intransponível ali. O spec detecta isso uma vez em beforeAll e escolhe
 * entre cobrir o caminho feliz ou cobrir o erro, em vez de falhar por uma
 * dependência de ambiente.
 *
 * Os passos 4 a 6 são alcançados retomando por `setup_progress.current_step`.
 * Isso não é atalho de teste: é o mecanismo de retomada do próprio wizard
 * (SetupPage lê current_step ao montar). Assim a cobertura de pipeline, canal e
 * conclusão não fica refém da IA.
 */

const ORG_FIELDS = [
  "name", "business_sector", "business_description", "target_audience",
  "main_problem_solved", "brand_tone", "ai_prohibitions",
  "good_response_example", "setup_completed", "setup_completed_at",
] as const;

type OrgSnapshot = Record<string, unknown>;
type StageSnapshot = Record<string, unknown>;

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
let orgAntes: OrgSnapshot;
let etapasAntes: StageSnapshot[];
let pipelineId: string | undefined;
let iaDisponivel = false;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  const email = process.env.E2E_EMAIL ?? "sabrina@viverdeia.ai";
  const password = process.env.E2E_PASSWORD;

  // Sem credenciais o spec não tem como restaurar o estado depois. Falhar aqui é
  // melhor que rodar e deixar a organização suja.
  expect(url, "SUPABASE_URL ausente").toBeTruthy();
  expect(anonKey, "chave publishable ausente").toBeTruthy();
  expect(password, "E2E_PASSWORD ausente").toBeTruthy();

  db = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await db.auth.signInWithPassword({
    email, password: password!,
  });
  expect(authErr, `login falhou: ${authErr?.message}`).toBeNull();

  const { data: profile } = await db
    .from("profiles").select("org_id").eq("id", auth!.user!.id).maybeSingle();
  orgId = profile!.org_id as string;

  const { data: org } = await db
    .from("organizations").select(ORG_FIELDS.join(",")).eq("id", orgId).single();
  orgAntes = org as unknown as OrgSnapshot;

  const { data: pipe } = await db
    .from("pipelines").select("id").eq("org_id", orgId).limit(1).maybeSingle();
  pipelineId = pipe?.id as string | undefined;
  if (pipelineId) {
    const { data: stages } = await db
      .from("pipeline_stages")
      .select("id, org_id, pipeline_id, name, order, color, win_probability")
      .eq("pipeline_id", pipelineId);
    etapasAntes = (stages ?? []) as StageSnapshot[];
  } else {
    etapasAntes = [];
  }

  // Descobre uma vez se a IA responde, para escolher qual cobertura do passo 3
  // faz sentido neste ambiente.
  const { data: sess } = await db.auth.getSession();
  const resp = await fetch(`${url}/functions/v1/generate-system-prompt`, {
    method: "POST",
    headers: {
      apikey: anonKey!,
      Authorization: `Bearer ${sess.session!.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agent_name: "Sonda" }),
  });
  const corpo = await resp.json().catch(() => ({}));
  // 400 de "contexto insuficiente" significa que a função está viva e só falta
  // preencher a empresa — o que o próprio wizard faz nos passos 1 e 2.
  iaDisponivel = resp.ok || resp.status === 400;
  if (!iaDisponivel) {
    console.warn(`[setup-wizard] IA indisponível (${resp.status}): ${corpo?.error ?? ""}`);
  }

  // Estado inicial do wizard.
  await db.from("organizations")
    .update({ setup_completed: false, setup_completed_at: null }).eq("id", orgId);
  await db.from("setup_progress")
    .upsert({ org_id: orgId, current_step: "empresa", completed_steps: [] }, { onConflict: "org_id" });
});

test.afterAll(async () => {
  if (!db || !orgId) return;

  await db.from("organizations").update(orgAntes).eq("id", orgId);

  // Restaura as etapas: o passo 4 substitui o conjunto quando não há deals.
  if (pipelineId && etapasAntes.length > 0) {
    await db.from("pipeline_stages").delete().eq("pipeline_id", pipelineId);
    await db.from("pipeline_stages").insert(etapasAntes);
  }

  await db.from("setup_progress").delete().eq("org_id", orgId);
  await db.auth.signOut();
});

/** Leva o wizard direto a um passo, pelo mesmo mecanismo de retomada da tela. */
async function retomarEm(page: Page, step: string) {
  await db.from("setup_progress")
    .upsert({ org_id: orgId, current_step: step }, { onConflict: "org_id" });
  await page.goto("/setup");
  await expect(page.getByTestId(`setup-step-${step}`)).toBeVisible();
}

test("passos 1 e 2 gravam o contexto da empresa", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByTestId("setup-step-empresa")).toBeVisible();

  await page.getByTestId("setup-org-name").fill("Empresa E2E Wizard");
  // O setor é uma grade de botões, um por opção, não um combobox.
  await page.locator('[data-testid="setup-sector"][data-sector="imobiliario"]').click();
  await page.getByTestId("setup-description").fill("Venda e locação de imóveis residenciais E2E.");
  await page.getByTestId("setup-problem").fill("Encontrar imóvel adequado sem perder tempo E2E.");
  await page.getByTestId("setup-next").click();

  await expect(page.getByTestId("setup-step-publico")).toBeVisible();
  await page.getByTestId("setup-audience").fill("Famílias procurando o primeiro imóvel E2E.");
  await page.getByTestId("setup-prohibitions").fill("Nunca prometer aprovação de financiamento E2E.");
  await page.getByTestId("setup-next").click();

  // Persistência: é o que alimenta a geração do prompt no passo 3.
  await expect(async () => {
    const { data } = await db
      .from("organizations")
      .select("name, business_sector, business_description, target_audience, ai_prohibitions")
      .eq("id", orgId).single();
    expect(data!.name).toBe("Empresa E2E Wizard");
    expect(data!.business_sector).toBe("imobiliario");
    expect(data!.business_description).toContain("E2E");
    expect(data!.target_audience).toContain("E2E");
    expect(data!.ai_prohibitions).toContain("E2E");
  }).toPass({ timeout: 10_000 });
});

test("passo 3 gera o prompt em blocos", async ({ page }) => {
  test.skip(!iaDisponivel, "generate-system-prompt indisponível neste ambiente");

  // O expect abaixo pede 90s, mas o `timeout` do config é 60s POR TESTE — e o
  // orçamento do teste vence primeiro, então a janela de 90s nunca fechava.
  // Medido em produção pelo AI Gateway (gemini-2.5-pro na tarefa "estruturado"):
  // 63s só na chamada. Com 60s o teste falhava sempre, ora esperando os blocos,
  // ora já no passo seguinte — e não por regressão do produto.
  test.setTimeout(180_000);

  await retomarEm(page, "ia");
  await page.getByTestId("setup-agent-name").fill("Sofia");

  // A geração é uma chamada de LLM: janela maior que o expect padrão de 10s.
  await expect(page.getByTestId("setup-block-role")).toBeVisible({ timeout: 90_000 });
  for (const bloco of ["role", "company", "core_philosophy", "sector_context",
    "guidelines", "cognitive_process", "output_format", "examples"]) {
    await expect(page.getByTestId(`setup-block-${bloco}`)).not.toBeEmpty();
  }

  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-step-pipeline")).toBeVisible();
});

test("passo 3 sem IA mostra o erro e bloqueia o avanço", async ({ page }) => {
  test.skip(iaDisponivel, "a IA está disponível; o caminho feliz é coberto no teste acima");

  await retomarEm(page, "ia");

  // Documenta o comportamento real: erro visível e wizard intransponível.
  await expect(page.getByTestId("setup-ia-error")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("setup-next")).toBeDisabled();
});

test("passo 4 sugere e aplica o pipeline do setor", async ({ page }) => {
  await retomarEm(page, "pipeline");

  const etapas = page.getByTestId("setup-stage-row");
  await expect(etapas.first()).toBeVisible();
  expect(await etapas.count()).toBeGreaterThan(0);

  // O aviso de preservação só existe quando há negócios no funil — ele promete
  // que nada será apagado. Com zero deals a substituição é segura, então a
  // ausência do aviso é o comportamento correto, não uma falha de renderização.
  const { count: deals } = await db
    .from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  await expect(page.getByTestId("setup-pipeline-warning"))
    .toHaveCount((deals ?? 0) > 0 ? 1 : 0);

  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-step-canal")).toBeVisible();

  await expect(async () => {
    const { data } = await db
      .from("pipeline_stages").select("name").eq("pipeline_id", pipelineId!);
    expect((data ?? []).length).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
});

test("passo 5 permite pular o canal e passo 6 conclui o setup", async ({ page }) => {
  await retomarEm(page, "canal");

  await page.getByTestId("setup-skip-channel").click();
  await expect(page.getByTestId("setup-step-concluido")).toBeVisible();

  const erros: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });

  await page.getByTestId("setup-finish").click();

  // Ordem proposital: o banco primeiro. Se a conclusão gravou mas a URL não
  // mudou, o defeito é de navegação; se não gravou, é da mutation. Assertar a
  // URL antes esconderia essa distinção.
  await expect(async () => {
    const { data } = await db
      .from("organizations").select("setup_completed").eq("id", orgId).single();
    expect(data!.setup_completed, `erros no console: ${erros.join(" | ")}`).toBe(true);
  }).toPass({ timeout: 15_000 });

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});
