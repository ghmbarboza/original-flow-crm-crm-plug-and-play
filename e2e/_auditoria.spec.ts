import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { test, expect, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * VARREDURA, NÃO TESTE DE REGRESSÃO.
 *
 * Este arquivo não afirma comportamento — ele percorre o sistema e produz um
 * relatório para humano ler, em auditoria/auditoria.md. Por isso não roda na
 * suíte normal: todo teste aqui é pulado sem AUDIT=1.
 *
 * O que ele encontra bem: erro de console, request 4xx/5xx, botão sem efeito
 * observável, link morto, falta de nome acessível, imagem sem alt, input sem
 * label, h1 ausente ou duplicado, e violações WCAG 2.1 AA pelo axe.
 *
 * O que ele NÃO encontra: usabilidade. Se um fluxo é confuso, se o rótulo é
 * ambíguo, se falta um atalho — isso é julgamento humano e está no roteiro de
 * TESTE_MANUAL.md. Também não cobre integração externa (WhatsApp real, geração
 * de IA, webhook): isso é validado à mão em produção.
 *
 * --- Por que está dividido em execuções separadas ---
 *
 * A primeira versão era um único teste que percorria as 20 rotas clicando até 25
 * botões em cada, com um reload entre cliques. Isso é da ordem de 500 navegações
 * num teste só, e estourou o timeout de 20 min sem gerar relatório nenhum
 * (2026-07-30). Pior: como o arquivo estava em `mode: "serial"`, o timeout do
 * primeiro teste pulou os outros três — o axe, a galeria e a geração do
 * relatório nunca chegaram a rodar.
 *
 * Agora cada rota é um teste com orçamento próprio, e cada fase roda numa
 * invocação separada:
 *
 *     AUDIT=1 npx playwright test e2e/_auditoria.spec.ts -g "varredura"
 *     AUDIT=1 npx playwright test e2e/_auditoria.spec.ts -g "axe"
 *     AUDIT=1 npx playwright test e2e/_auditoria.spec.ts -g "galeria"
 *     AUDIT=1 npx playwright test e2e/_auditoria.spec.ts -g "relatorio"
 *
 * (ou `npm run audit:varredura`, `audit:axe`, `audit:galeria`, `audit:relatorio`.)
 *
 * Para isso funcionar entre processos, cada teste GRAVA seus achados em
 * auditoria/parciais/*.json e o relatório LÊ o diretório. Estado em memória
 * não serviria: o Playwright derruba o worker quando um teste estoura o timeout,
 * e levaria junto tudo que as rotas anteriores encontraram.
 *
 * Tudo mora em `auditoria/`, NÃO em `test-results/`: o Playwright limpa o
 * outputDir no início de CADA invocação, então com as fases em execuções
 * separadas cada fase apagava os artefatos da anterior — a do relatório
 * apagava tudo e não encontrava nada (aconteceu em 2026-07-30, as três fases
 * "passaram" e o relatório falhou de mãos vazias).
 *
 * NÃO DESTRUTIVO por construção: só clica em elementos que não casam com a lista
 * de padrões destrutivos abaixo, e nunca submete formulário. O relatório lista o
 * que foi pulado, para o pulo não passar por cobertura.
 */

/** Rotas autenticadas. `/setup` fica fora: tem guard próprio e visitá-lo
 *  altera `setup_progress`; é coberto por setup-wizard.spec.ts.
 *
 *  Sprint 10A/10B: as abas de /settings com telas novas (Atendimento = SLA +
 *  NPS + importação de histórico; Integrações = Cal.com + ERP; Pipeline =
 *  automações por etapa) entram como rotas próprias — a varredura da rota
 *  /settings só enxerga a aba default. `/contacts/:id` (ficha com timeline) é
 *  resolvida em tempo de teste para um contato real da org. */
const ROTAS = [
  "/dashboard", "/contacts", "/contacts/:id", "/companies", "/deals",
  "/tasks", "/products", "/whatsapp", "/inbox",
  "/email-templates", "/campaigns", "/library", "/automations", "/followup",
  "/email-sequences", "/reports", "/sales-goals", "/lead-scoring", "/team",
  "/settings", "/settings/atendimento", "/settings/integrations",
  "/settings/pipeline", "/help",
];

/**
 * Resolve rota com parâmetro para uma URL concreta. Para /contacts/:id, pega o
 * primeiro contato do org pela REST com os headers da própria sessão do app —
 * nada hardcodado. Retorna null quando não há como resolver (org sem contato).
 */
async function resolver(page: Page, rota: string): Promise<string | null> {
  if (!rota.includes(":id")) return rota;
  const reqPromise = page
    .waitForRequest((r) => /\/rest\/v1\//.test(r.url()) && !!r.headers()["apikey"], { timeout: 20_000 })
    .catch(() => null);
  await page.goto("/contacts", { waitUntil: "domcontentloaded" }).catch(() => {});
  const req = await reqPromise;
  if (!req) return null;
  const headers = req.headers();
  const base = new URL(req.url()).origin;
  const resp = await page.request.get(`${base}/rest/v1/contacts?select=id&is_active=eq.true&limit=1`, {
    headers: { apikey: headers["apikey"], Authorization: headers["authorization"] ?? "" },
  });
  const rows = (await resp.json().catch(() => [])) as Array<{ id: string }>;
  return rows[0]?.id ? rota.replace(":id", rows[0].id) : null;
}

/** Nunca clicar: apaga, desconecta ou tira o usuário da sessão. */
const DESTRUTIVO = /remov|exclu|apagar|deletar|delete|limpar|desconect|sair|logout|encerrar|revogar|resetar|zerar|cancelar assinatura|desativar|arquivar/i;

/** Ruído de console que não indica defeito do produto. */
const RUIDO_CONSOLE = [
  /Download the React DevTools/i,
  /React Router Future Flag/i,
  /\[vite\]/i,
  /Browserslist/i,
  // Request abortado quando a varredura navega para a próxima rota. A primeira
  // execução atribuiu um "Failed to fetch" a /help, que não usa Supabase — o erro
  // era da rota anterior, cancelada no meio. Não é defeito do produto.
  /Failed to fetch/i,
  // Mesma classe: chamada de edge function cancelada pela navegação da própria
  // varredura (a resolução de /contacts/:id navega duas vezes em sequência).
  /FunctionsFetchError|Failed to send a request/i,
  // Canal do Supabase Realtime derrubado quando a varredura troca de rota no
  // meio do handshake. Falha real de realtime apareceria como defeito
  // funcional (tela sem atualizar), não como este warning de navegação.
  /WebSocket connection .* failed|realtime\/v1\/websocket/i,
];

const DIR = "auditoria/parciais";

interface Achado { rota: string; tipo: string; detalhe: string }
/** Violação de acessibilidade encontrada pelo axe. */
interface ViolacaoAxe { rota: string; id: string; impacto: string; descricao: string; alvos: string[] }
/** Uma tela capturada em desktop e mobile. */
interface Captura { rota: string; desktop: string; mobile: string }
/** O que uma fase grava em disco para o relatório juntar depois. */
interface Parcial {
  achados: Achado[];
  pulados: string[];
  violacoes: ViolacaoAxe[];
  capturas: Captura[];
}

function slug(rota: string) {
  // Só caracteres seguros para nome de arquivo (":" de /contacts/:id quebraria
  // no Windows). Rotas antigas mantêm o mesmo slug de antes.
  return rota.replace(/[^a-z0-9-]/gi, "") || "raiz";
}

/** Acumula os achados de UMA rota e publica ao final do teste. Um arquivo por
 *  (fase, rota): rodar a mesma fase de novo sobrescreve só o que mudou, e uma
 *  rota que estourou o timeout não leva as outras junto. */
class Coletor {
  private readonly parcial: Parcial = { achados: [], pulados: [], violacoes: [], capturas: [] };

  constructor(private readonly fase: string, readonly rota: string) {}

  anota(tipo: string, detalhe: string) {
    this.parcial.achados.push({ rota: this.rota, tipo, detalhe: detalhe.replace(/\s+/g, " ").slice(0, 300) });
  }
  pula(rotulo: string, motivo: string) {
    this.parcial.pulados.push(`${this.rota} · "${rotulo}" (${motivo})`);
  }
  violacao(v: ViolacaoAxe) { this.parcial.violacoes.push(v); }
  captura(c: Captura) { this.parcial.capturas.push(c); }

  publica() {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(`${DIR}/${this.fase}-${slug(this.rota)}.json`, JSON.stringify(this.parcial), "utf8");
  }
}

/** Liga os coletores de console e rede numa página. */
function coletar(page: Page, c: Coletor) {
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const texto = msg.text();
    if (RUIDO_CONSOLE.some((r) => r.test(texto))) return;
    c.anota(msg.type() === "error" ? "console-error" : "console-warning", texto);
  });
  page.on("pageerror", (err) => c.anota("exceção-js", err.message));
  page.on("response", (resp) => {
    if (resp.status() < 400) return;
    // 401/403 em rota anônima é esperado; aqui a sessão está autenticada.
    c.anota("http-" + resp.status(), `${resp.request().method()} ${resp.url()}`);
  });
}

/** Checagens de acessibilidade que não dependem de biblioteca externa. */
async function acessibilidade(page: Page, c: Coletor) {
  const r = await page.evaluate(() => {
    // Um <label> envolvente também nomeia (associação implícita de elementos
    // rotuláveis — é como o axe e os leitores de tela resolvem o nome). Sem
    // isso, todo Checkbox/Switch dentro de <label> vira falso positivo.
    const nomeDe = (el: Element) =>
      (el.getAttribute("aria-label") || el.getAttribute("title") ||
       (el as HTMLElement).innerText ||
       (el.closest("label")?.textContent ?? "")).trim();

    const semNome = [...document.querySelectorAll("button, a[href]")]
      .filter((el) => {
        const e = el as HTMLElement;
        if (e.offsetParent === null) return false;              // invisível
        if (nomeDe(el)) return false;
        return !el.querySelector("img[alt]:not([alt=''])");
      })
      .map((el) => el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""));

    const imgSemAlt = [...document.querySelectorAll("img:not([alt])")].length;

    const inputSemLabel = [...document.querySelectorAll("input, textarea, select")]
      .filter((el) => {
        const e = el as HTMLInputElement;
        if (e.type === "hidden" || e.offsetParent === null) return false;
        if (e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.getAttribute("placeholder")) return false;
        return !(e.id && document.querySelector(`label[for="${e.id}"]`));
      }).length;

    const h1 = document.querySelectorAll("h1").length;
    return { semNome, imgSemAlt, inputSemLabel, h1 };
  });

  if (r.semNome.length) c.anota("a11y-sem-nome", `${r.semNome.length} elemento(s) clicável(is) sem nome acessível: ${r.semNome.slice(0, 6).join(", ")}`);
  if (r.imgSemAlt) c.anota("a11y-img-sem-alt", `${r.imgSemAlt} imagem(ns) sem alt`);
  if (r.inputSemLabel) c.anota("a11y-input-sem-label", `${r.inputSemLabel} campo(s) sem label associado`);
  if (r.h1 === 0) c.anota("a11y-sem-h1", "página sem <h1>");
  if (r.h1 > 1) c.anota("a11y-h1-duplicado", `${r.h1} elementos <h1>`);
}

/** Assinatura do estado observável, para detectar se um clique fez algo. */
async function assinatura(page: Page) {
  return page.evaluate(() => ({
    url: location.pathname + location.search,
    dom: document.body.innerHTML.length,
    dialogs: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
    toasts: document.querySelectorAll("[data-sonner-toast]").length,
    texto: document.body.innerText.length,
    // Switch/checkbox alternado muda pouquíssimo DOM — sem contar o estado
    // marcado, "Ativar X" aparecia como botão sem efeito (falso positivo da
    // auditoria de 2026-07-31).
    marcados: document.querySelectorAll('[data-state="checked"], [aria-checked="true"], [aria-pressed="true"]').length,
  }));
}

/** Links internos que levam a lugar nenhum. */
async function linksMortos(page: Page, c: Coletor) {
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href^='/']")]
      .map((a) => (a as HTMLAnchorElement).getAttribute("href")!)
      .filter((h) => !h.startsWith("//")),
  );
  const unicos = [...new Set(hrefs)];
  const conhecidas = new Set([...ROTAS, "/setup", "/help", "/settings", "/deals", "/whatsapp"]);
  for (const href of unicos) {
    const base = "/" + (href.split("?")[0].split("/")[1] ?? "");
    if (!conhecidas.has(base) && base !== "/") {
      c.anota("link-suspeito", `href="${href}" não casa com rota conhecida`);
    }
  }
}

// ---------------------------------------------------------------------------
// Fase 1 — varredura mecânica, uma rota por teste
// ---------------------------------------------------------------------------

for (const rota of ROTAS) {
  test(`varredura · ${rota}`, async ({ page }) => {
    test.skip(!process.env.AUDIT, "varredura sob demanda: rode com AUDIT=1");
    // Orçamento por rota. /settings e /deals são as mais caras (muitos botões);
    // 4 min cobre as duas com folga e ainda assim o run inteiro é interrompível.
    test.setTimeout(4 * 60_000);

    const c = new Coletor("varredura", rota);
    coletar(page, c);

    try {
      const alvo = await resolver(page, rota);
      if (!alvo) {
        c.anota("falha-navegacao", "não foi possível resolver a rota (org sem contato?)");
        return;
      }

      // 1) A tela abre?
      try {
        await page.goto(alvo, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      } catch (e) {
        c.anota("falha-navegacao", e instanceof Error ? e.message : String(e));
        return;
      }

      const h1 = page.locator("h1").first();
      if (!(await h1.isVisible().catch(() => false))) {
        c.anota("sem-h1-visivel", "a tela não renderizou um h1 visível");
      }
      if (page.url().includes("/auth")) {
        c.anota("redirect-para-auth", "sessão perdida ou rota protegida indevidamente");
        return;
      }

      await acessibilidade(page, c);
      await linksMortos(page, c);

      // 2) Botões: clicar um por vez, recarregando entre cliques para não
      //    encadear estado de um clique no próximo.
      const seletor = 'button:not([disabled]):not([aria-hidden="true"])';
      const total = Math.min(await page.locator(seletor).count(), 25);

      for (let i = 0; i < total; i++) {
        await page.goto(alvo, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

        const botao: Locator = page.locator(seletor).nth(i);
        if (!(await botao.isVisible().catch(() => false))) continue;

        const rotulo = ((await botao.innerText().catch(() => "")) ||
          (await botao.getAttribute("aria-label").catch(() => "")) || `#${i}`).trim().replace(/\s+/g, " ");

        if (DESTRUTIVO.test(rotulo)) { c.pula(rotulo, "destrutivo"); continue; }
        if ((await botao.getAttribute("type").catch(() => "")) === "submit") {
          c.pula(rotulo, "submit de formulário"); continue;
        }

        // Aba ou toggle já ativo não muda nada quando clicado — e isso é correto.
        // Sem esta trava, a varredura acusava "Lista", "Kanban", "Todos" e "Geral"
        // como botões sem efeito, que foi o maior ruído da primeira execução.
        const jaAtivo = await botao.evaluate((el) =>
          el.getAttribute("aria-selected") === "true" ||
          el.getAttribute("aria-pressed") === "true" ||
          el.getAttribute("data-state") === "active" ||
          el.getAttribute("data-state") === "checked",
        ).catch(() => false);
        if (jaAtivo) { c.pula(rotulo, "já ativo"); continue; }

        // window.print() e seletor de arquivo abrem diálogo nativo, que o Playwright
        // suprime e não altera o DOM. Acusar isso é falso positivo garantido.
        const nativo = await botao.evaluate((el) =>
          /print|imprimir|pdf/i.test(el.textContent ?? "") ||
          !!el.closest("label") ||
          !!el.parentElement?.querySelector('input[type="file"]'),
        ).catch(() => false);
        if (nativo) { c.pula(rotulo, "abre diálogo nativo"); continue; }

        const antes = await assinatura(page);
        let requests = 0;
        const conta = () => { requests++; };
        page.on("request", conta);

        try {
          await botao.click({ timeout: 4000 });
          await page.waitForTimeout(600);
        } catch {
          page.off("request", conta);
          c.anota("botao-nao-clicavel", `"${rotulo}" visível mas o clique falhou`);
          continue;
        }
        page.off("request", conta);

        const depois = await assinatura(page);
        const mudou =
          antes.url !== depois.url ||
          antes.dialogs !== depois.dialogs ||
          antes.toasts !== depois.toasts ||
          antes.marcados !== depois.marcados ||
          Math.abs(antes.texto - depois.texto) > 20 ||
          Math.abs(antes.dom - depois.dom) > 200 ||
          requests > 0;

        if (!mudou) {
          c.anota("botao-sem-efeito", `"${rotulo}" — nenhuma mudança observável (candidato, revisar à mão)`);
        }
      }
    } finally {
      // Mesmo se a rota estourar o orçamento, o que ela já encontrou é gravado.
      c.publica();
    }
  });
}

// ---------------------------------------------------------------------------
// Fase 2 — acessibilidade WCAG por tela (axe)
// ---------------------------------------------------------------------------

for (const rota of ROTAS) {
  test(`axe · ${rota}`, async ({ page }) => {
    test.skip(!process.env.AUDIT, "varredura sob demanda: rode com AUDIT=1");
    test.setTimeout(90_000);

    const c = new Coletor("axe", rota);
    try {
      const alvo = await resolver(page, rota);
      if (!alvo) { c.anota("axe-falhou", "não foi possível resolver a rota"); return; }
      await page.goto(alvo, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

      const r = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
        .catch(() => null);
      if (!r) { c.anota("axe-falhou", "nao foi possivel analisar a tela"); return; }

      for (const v of r.violations) {
        c.violacao({
          rota,
          id: v.id,
          impacto: v.impact ?? "desconhecido",
          descricao: v.help,
          alvos: v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
        });
      }
    } finally {
      c.publica();
    }
  });
}

// ---------------------------------------------------------------------------
// Fase 3 — galeria de telas em desktop e mobile
// ---------------------------------------------------------------------------

for (const rota of ROTAS) {
  test(`galeria · ${rota}`, async ({ page }) => {
    test.skip(!process.env.AUDIT, "varredura sob demanda: rode com AUDIT=1");
    test.setTimeout(90_000);

    const c = new Coletor("galeria", rota);
    try {
      const alvo = await resolver(page, rota);
      if (!alvo) { c.anota("captura-falhou", "não foi possível resolver a rota"); return; }
      mkdirSync("auditoria/telas", { recursive: true });
      const nome = slug(rota);
      const modos = [
        { modo: "desktop", largura: 1280, altura: 800 },
        { modo: "mobile", largura: 390, altura: 844 },
      ];

      // Redimensionar na mesma passada é mais barato que abrir a rota duas vezes.
      for (const { modo, largura, altura } of modos) {
        await page.setViewportSize({ width: largura, height: altura });
        await page.goto(alvo, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        // Deixa a animação de entrada terminar, senão a captura pega meio fade.
        await page.waitForTimeout(400);
        await page
          .screenshot({ path: `auditoria/telas/${nome}-${modo}.png`, fullPage: true })
          .catch(() => c.anota("captura-falhou", `nao foi possivel capturar em ${modo}`));

        // Overflow horizontal só importa em mobile, e é o defeito de layout
        // responsivo mais comum.
        if (modo === "mobile") {
          const vaza = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
          );
          if (vaza) c.anota("overflow-horizontal-mobile", "a pagina rola para o lado em 390px de largura");
        }
      }

      c.captura({ rota, desktop: `telas/${nome}-desktop.png`, mobile: `telas/${nome}-mobile.png` });
    } finally {
      c.publica();
    }
  });
}

// ---------------------------------------------------------------------------
// Fase 4 — relatório, lendo o que as fases anteriores gravaram
// ---------------------------------------------------------------------------

test("relatorio da auditoria", async () => {
  test.skip(!process.env.AUDIT, "varredura sob demanda: rode com AUDIT=1");

  expect(existsSync(DIR), `${DIR} não existe — rode as fases antes do relatório`).toBe(true);

  const achados: Achado[] = [];
  const pulados: string[] = [];
  const violacoes: ViolacaoAxe[] = [];
  const capturas: Captura[] = [];

  const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  for (const f of arquivos) {
    const p = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as Parcial;
    achados.push(...p.achados);
    pulados.push(...p.pulados);
    violacoes.push(...p.violacoes);
    capturas.push(...p.capturas);
  }

  // Uma fase que nunca rodou é diferente de uma fase sem achados, e o relatório
  // precisa dizer qual das duas — senão "0 violações" lê como aprovação.
  const rodou = (fase: string) => arquivos.filter((f) => f.startsWith(fase + "-")).length;
  const cobertura = [
    `varredura: ${rodou("varredura")}/${ROTAS.length} rotas`,
    `axe: ${rodou("axe")}/${ROTAS.length}`,
    `galeria: ${rodou("galeria")}/${ROTAS.length}`,
  ].join(" · ");

  const porTipo = new Map<string, Achado[]>();
  for (const a of achados) {
    if (!porTipo.has(a.tipo)) porTipo.set(a.tipo, []);
    porTipo.get(a.tipo)!.push(a);
  }
  const ordem = [...porTipo.entries()].sort((a, b) => b[1].length - a[1].length);

  const L: string[] = [
    "# Auditoria automatizada",
    "",
    `Cobertura desta execucao — ${cobertura}`,
    "",
    `Achados mecanicos: ${achados.length} · violacoes de acessibilidade: ${violacoes.length}`,
    "",
    "**Lista de candidatos, nao veredito.** Usabilidade nao esta aqui — ver",
    "`TESTE_MANUAL.md`. Galeria de telas: `auditoria/galeria.html`.",
    "",
  ];

  if (!achados.length) L.push("Nenhum achado mecanico.", "");
  for (const [tipo, itens] of ordem) {
    L.push(`## ${tipo} (${itens.length})`, "");
    for (const i of itens) L.push(`- \`${i.rota}\` — ${i.detalhe}`);
    L.push("");
  }

  const PESO: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3, desconhecido: 4 };
  const porRegra = new Map<string, ViolacaoAxe[]>();
  for (const v of violacoes) {
    if (!porRegra.has(v.id)) porRegra.set(v.id, []);
    porRegra.get(v.id)!.push(v);
  }
  L.push("## Acessibilidade (axe / WCAG 2.1 AA)", "");
  if (!porRegra.size) {
    L.push(rodou("axe") ? "Nenhuma violacao." : "**A fase do axe nao rodou nesta execucao.**", "");
  } else {
    const regras = [...porRegra.entries()].sort(
      (a, b) => (PESO[a[1][0].impacto] ?? 9) - (PESO[b[1][0].impacto] ?? 9) || b[1].length - a[1].length,
    );
    for (const [id, vs] of regras) {
      const rotas = [...new Set(vs.map((v) => v.rota))];
      L.push(`### ${vs[0].impacto} — ${id} (${rotas.length} tela(s))`, "");
      L.push(vs[0].descricao, "");
      L.push(`Telas: ${rotas.map((r) => `\`${r}\``).join(", ")}`, "");
      L.push(`Exemplo de alvo: \`${vs[0].alvos[0] ?? "?"}\``, "");
    }
  }

  // Agrupa por rótulo: "Sair" aparece em quase toda rota (é do sidebar), e 19
  // linhas iguais escondem o que é específico de uma tela.
  const porRotulo = new Map<string, string[]>();
  for (const p of [...new Set(pulados)]) {
    const m = p.match(/^(.*?) · "(.*)" \((.*)\)$/);
    if (!m) continue;
    const chave = `"${m[2]}" (${m[3]})`;
    if (!porRotulo.has(chave)) porRotulo.set(chave, []);
    porRotulo.get(chave)!.push(m[1]);
  }
  L.push(`## Nao clicado pela varredura (${porRotulo.size} acao(oes) distinta(s))`, "");
  L.push("Destrutivas, submits, dialogos nativos e abas ja ativas.", "**As destrutivas precisam de teste manual.**", "");
  for (const [chave, rotas] of [...porRotulo.entries()].sort()) {
    L.push(rotas.length > 3 ? `- ${chave} — em ${rotas.length} telas` : `- ${chave} — ${rotas.join(", ")}`);
  }
  L.push("");

  mkdirSync("auditoria", { recursive: true });
  writeFileSync("auditoria/auditoria.md", L.join("\n"), "utf8");

  const cards = capturas
    .sort((a, b) => ROTAS.indexOf(a.rota) - ROTAS.indexOf(b.rota))
    .map(
      (c) => `
    <section>
      <h2>${c.rota}</h2>
      <div class="par">
        <figure><figcaption>desktop 1280</figcaption><img src="${c.desktop}" loading="lazy"></figure>
        <figure><figcaption>mobile 390</figcaption><img src="${c.mobile}" loading="lazy" class="mob"></figure>
      </div>
    </section>`,
    )
    .join("");

  const html = [
    "<!doctype html>",
    '<html lang="pt-BR"><head><meta charset="utf-8"><title>Galeria de telas — FlowCRM</title>',
    "<style>",
    "  :root { color-scheme: light dark }",
    "  body { font: 15px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 24px; max-width: 1400px }",
    "  h1 { font-size: 22px }",
    "  h2 { font-size: 16px; font-family: ui-monospace, monospace; margin: 32px 0 8px }",
    "  .par { display: grid; grid-template-columns: 1fr 390px; gap: 16px; align-items: start }",
    "  @media (max-width: 900px) { .par { grid-template-columns: 1fr } }",
    "  figure { margin: 0 } figcaption { font-size: 12px; opacity: .6; margin-bottom: 4px }",
    "  img { width: 100%; border: 1px solid #8883; border-radius: 6px; display: block }",
    "  img.mob { width: 390px; max-width: 100% }",
    "  p.nota { opacity: .75 }",
    "</style></head><body>",
    "<h1>Galeria de telas — FlowCRM</h1>",
    `<p class="nota">${capturas.length} telas, desktop e mobile, pagina inteira.`,
    "Procure: texto vazando, elemento cortado, espacamento inconsistente, estado vazio sem",
    "orientacao, hierarquia visual confusa. Defeito de layout vira issue; julgamento de",
    "usabilidade vai para o roteiro de teste manual.</p>",
    cards,
    "</body></html>",
  ].join("\n");
  writeFileSync("auditoria/galeria.html", html, "utf8");

  console.log(`\n[auditoria] ${cobertura}`);
  console.log(`[auditoria] ${achados.length} achado(s) mecanico(s), ${violacoes.length} violacao(oes) de a11y, ${capturas.length} tela(s).`);
  console.log("[auditoria] auditoria/auditoria.md");
  console.log("[auditoria] auditoria/galeria.html\n");
  for (const [tipo, itens] of ordem) console.log(`  ${String(itens.length).padStart(3)} x ${tipo}`);
  const contagem = new Map<string, number>();
  for (const v of violacoes) contagem.set(v.impacto, (contagem.get(v.impacto) ?? 0) + 1);
  for (const [imp, n] of contagem) console.log(`  ${String(n).padStart(3)} x a11y-${imp}`);
});
