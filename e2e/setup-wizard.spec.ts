import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { credencial as env } from "./helpers";

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

let db: SupabaseClient;
let orgId: string;
let orgAntes: OrgSnapshot;
let etapasAntes: StageSnapshot[];
let pipelineId: string | undefined;
let iaDisponivel = false;
// O passo 3 grava a configuração de IA e importa FAQs/objeções. Sem snapshot,
// cada run sobrescrevia o agente da organização e acumulava base de
// conhecimento: medido em 2026-07-29, 16 FAQs e 12 objeções deixadas para trás.
let configAntes: Record<string, unknown> | null = null;
let faqIdsAntes = new Set<string>();
let objecaoIdsAntes = new Set<string>();

async function idsDe(tabela: "ai_knowledge_faqs" | "ai_knowledge_objections"): Promise<Set<string>> {
  const { data } = await db.from(tabela).select("id").eq("org_id", orgId);
  return new Set((data ?? []).map((r) => r.id as string));
}

/** Apaga só o que este run criou, comparando com o snapshot inicial. */
async function apagarNovos(
  tabela: "ai_knowledge_faqs" | "ai_knowledge_objections",
  antes: Set<string>,
) {
  const agora = await idsDe(tabela);
  const novos = [...agora].filter((id) => !antes.has(id));
  if (novos.length) await db.from(tabela).delete().in("id", novos);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anonKey = env("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  const email = env("E2E_EMAIL") ?? "sabrina@viverdeia.ai";
  const password = env("E2E_PASSWORD");

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

  const { data: cfg } = await db
    .from("ai_messaging_config").select("*").eq("org_id", orgId).maybeSingle();
  configAntes = (cfg as Record<string, unknown> | null) ?? null;
  faqIdsAntes = await idsDe("ai_knowledge_faqs");
  objecaoIdsAntes = await idsDe("ai_knowledge_objections");

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

  // Base de conhecimento e configuração de IA: devolve ao estado de antes.
  await apagarNovos("ai_knowledge_faqs", faqIdsAntes);
  await apagarNovos("ai_knowledge_objections", objecaoIdsAntes);
  if (configAntes) {
    await db.from("ai_messaging_config").update(configAntes).eq("org_id", orgId);
    // As versões que o run gerou ficariam no histórico como se fossem do usuário.
    const versaoAntes = configAntes.prompt_version as number | undefined;
    if (typeof versaoAntes === "number") {
      await db.from("ai_prompt_versions").delete().eq("org_id", orgId).gt("version", versaoAntes);
    }
  }

  // Escopo local de propósito: o signOut padrão do Supabase é GLOBAL e revoga
  // todas as sessões do usuário, inclusive a que o navegador carrega de
  // e2e/.auth/user.json. As chamadas REST seguem funcionando (JWT é verificado
  // stateless), mas as edge functions validam o token com getUser contra o
  // servidor de auth e passam a responder 401 — quebrando specs posteriores por
  // um motivo que não tem nada a ver com eles.
  await db.auth.signOut({ scope: "local" });
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

/**
 * Falha da IA no passo 3 — o caminho que antes travava o onboarding.
 *
 * A falha é forçada interceptando a chamada, em vez de esperar que o provedor
 * esteja fora. Isso troca um teste que só rodava por acidente de ambiente (o
 * antigo dependia de `iaDisponivel === false`, e era pulado quase sempre) por um
 * que roda a cada execução, é determinístico e não gasta crédito de IA.
 */
test("passo 3: falha da IA oferece rascunho e não trava o wizard", async ({ page }) => {
  await page.route("**/functions/v1/generate-system-prompt", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "A IA não respondeu como esperado. Tente de novo." }),
    }),
  );

  await retomarEm(page, "ia");

  // O erro aparece com a causa real vinda da function, não a genérica do client.
  const erro = page.getByTestId("setup-ia-error");
  await expect(erro).toBeVisible({ timeout: 30_000 });
  await expect(erro).toContainText("A IA não respondeu como esperado");

  // Sem blocos ainda não se avança — o rascunho é escolha explícita.
  await expect(page.getByTestId("setup-next")).toBeDisabled();

  await page.getByTestId("setup-ia-rascunho").click();

  // Rascunho montado localmente: avisado como rascunho e com todos os blocos.
  await expect(page.getByTestId("setup-ia-rascunho-aviso")).toBeVisible();
  await expect(page.getByTestId("setup-ia-rascunho-aviso")).toContainText("revise antes de ativar");
  for (const bloco of ["role", "company", "core_philosophy", "sector_context",
    "guidelines", "cognitive_process", "output_format", "examples"]) {
    await expect(page.getByTestId(`setup-block-${bloco}`)).not.toBeEmpty();
  }

  // O que importa: dá para sair da etapa.
  await page.getByTestId("setup-next").click();
  await expect(page.getByTestId("setup-step-pipeline")).toBeVisible();

  // E a IA não pode ter sido ativada por um prompt que ela não escreveu.
  await expect(async () => {
    const { data } = await db
      .from("ai_messaging_config")
      .select("is_active, system_prompt")
      .eq("org_id", orgId).maybeSingle();
    expect(data!.is_active).toBe(false);
    expect(data!.system_prompt).toContain("<role>");
  }).toPass({ timeout: 10_000 });
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
