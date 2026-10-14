// Ferramentas de gestão do assistente: funis, metas, equipe, produtos,
// empresas e o que está automatizado. Mesmas regras de ferramentas.ts: só
// leitura, client do próprio usuário (RLS decide o que ele vê) e `link` em
// cada resultado.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  definicaoDaMetrica, periodoQueContem, progresso, realizado, rotuloPeriodo,
  type DadosMetas, type FiltrosMeta, type Metrica, type Periodo, type TipoPeriodo,
} from "../metas.ts";

type Json = Record<string, unknown>;
export interface CtxGestao {
  db: SupabaseClient;
  orgId: string;
  userId: string;
}

const DIA_MS = 86_400_000;
const PAGINA = 1000;
const MAX_PAGINAS = 20;
const LISTA_MAX = 50;
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const termo = (v: unknown) => String(v ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
const hojeEmBrasilia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lê todas as linhas em páginas de 1000 (limite do PostgREST), até um teto.
 * Passou do teto: lança erro em vez de devolver total menor como se fosse real.
 */
export async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await consulta(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return linhas;
  }
  throw new Error(`Mais de ${MAX_PAGINAS * PAGINA} registros: refine o período ou o filtro.`);
}

interface Funil { id: string; name: string; is_default: boolean }
interface Etapa { id: string; name: string; order: number; pipeline_id: string; win_probability: number | null }

async function funisEEtapas(ctx: CtxGestao): Promise<{ funis: Funil[]; etapas: Etapa[] }> {
  const [f, e] = await Promise.all([
    ctx.db.from("pipelines").select("id, name, is_default").eq("org_id", ctx.orgId).order("created_at"),
    ctx.db.from("pipeline_stages").select("id, name, order, pipeline_id, win_probability").eq("org_id", ctx.orgId).order("order"),
  ]);
  return { funis: (f.data ?? []) as Funil[], etapas: (e.data ?? []) as Etapa[] };
}

/** Funil pelo nome (sem acento, parcial). null quando não há filtro; erro quando o nome não existe. */
export function acharFunil(funis: Funil[], nome: unknown): Funil | null | { erro: string } {
  const normal = (t: string) => semAcento(t).replace(/[^a-z0-9]+/g, " ").trim();
  const alvo = normal(String(nome ?? ""));
  if (!alvo) return null;
  return funis.find((f) => normal(f.name) === alvo) ?? funis.find((f) => normal(f.name).includes(alvo))
    ?? { erro: `Nenhum funil com o nome "${nome}". Funis: ${funis.map((f) => f.name).join(", ") || "nenhum"}.` };
}

/** Todas as etapas do funil na ordem, inclusive as vazias; negócio de etapa desconhecida vai para "Sem etapa" no fim. */
export function abertosPorEtapa(etapas: { id: string; name: string; order: number }[], abertos: { stage_id: unknown; value: unknown }[]) {
  const linhas = [...etapas].sort((x, y) => x.order - y.order).map((e) => ({ id: e.id as string | null, etapa: e.name, quantidade: 0, valor: 0 }));
  const semEtapa = { id: null, etapa: "Sem etapa", quantidade: 0, valor: 0 };
  for (const d of abertos) {
    const linha = linhas.find((l) => l.id === d.stage_id) ?? semEtapa;
    linha.quantidade += 1;
    linha.valor += Number(d.value ?? 0);
  }
  return [...linhas, ...(semEtapa.quantidade ? [semEtapa] : [])].map(({ etapa, quantidade, valor }) => ({ etapa, quantidade, valor }));
}

/** Funis com etapas, abertos por etapa e ganhos/perdidos (pela data do fechamento) no período. */
export async function resumoFunil(ctx: CtxGestao, a: Json) {
  const dias = Math.min(365, Math.max(1, Number(a.periodo_dias) || 30));
  const desde = new Date(Date.now() - dias * DIA_MS).toISOString();
  const { funis, etapas } = await funisEEtapas(ctx);
  const escolhido = acharFunil(funis, a.funil);
  if (escolhido && "erro" in escolhido) return escolhido;
  const alvo = escolhido ? [escolhido] : funis;
  const [abertos, fechados] = await Promise.all([
    todas<{ stage_id: string | null; value: number | null }>((de, ate) => ctx.db.from("deals").select("stage_id, value").eq("org_id", ctx.orgId).eq("status", "open").order("id").range(de, ate)),
    todas<{ stage_id: string | null; status: string; value: number | null }>((de, ate) => ctx.db.from("deals").select("stage_id, status, value").eq("org_id", ctx.orgId).in("status", ["won", "lost"]).gte("closed_at", desde).order("id").range(de, ate)),
  ]);
  const funilDaEtapa = new Map(etapas.map((e) => [e.id, e.pipeline_id]));
  const resumo = alvo.map((f) => {
    const daqui = (d: { stage_id: string | null }) => funilDaEtapa.get(d.stage_id ?? "") === f.id;
    const porEtapa = abertosPorEtapa(etapas.filter((e) => e.pipeline_id === f.id), abertos.filter(daqui));
    const fech = fechados.filter(daqui);
    const soma = (s: string) => fech.filter((d) => d.status === s).reduce((t, d) => t + Number(d.value ?? 0), 0);
    const conta = (s: string) => fech.filter((d) => d.status === s).length;
    return {
      funil: f.name, padrao: f.is_default, link: `/deals?funil=${f.id}`,
      abertos_por_etapa: porEtapa.map((e) => ({ ...e, valor: moeda(e.valor) })),
      total_aberto: moeda(porEtapa.reduce((t, e) => t + e.valor, 0)),
      [`ganhos_${dias}_dias`]: { quantidade: conta("won"), valor: moeda(soma("won")) },
      [`perdidos_${dias}_dias`]: { quantidade: conta("lost"), valor: moeda(soma("lost")) },
    };
  });
  return { total_de_funis: funis.length, funis: resumo, onde_editar_etapas: "/settings/automations?secao=funil" };
}

/** Funis e etapas como estão configurados: ordem, probabilidade e qual é o padrão. */
export async function configuracaoDosFunis(ctx: CtxGestao) {
  const { funis, etapas } = await funisEEtapas(ctx);
  return {
    link: "/settings/automations?secao=funil",
    funis: funis.map((f) => ({
      nome: f.name, padrao: f.is_default, link: `/deals?funil=${f.id}`,
      etapas: etapas.filter((e) => e.pipeline_id === f.id).map((e) => ({ nome: e.name, probabilidade: e.win_probability != null ? `${e.win_probability}%` : null })),
    })),
  };
}

const PERIODOS_FIXOS = ["semana", "mes", "trimestre", "semestre", "ano"] as const;

/** Período pedido: datas livres, ou o tipo que contém a referência (padrão: mês atual). */
export function periodoPedido(a: Json, hoje = hojeEmBrasilia()): Periodo {
  if (DATA.test(String(a.de)) && DATA.test(String(a.ate)) && String(a.de) <= String(a.ate)) return { tipo: "personalizado", inicio: String(a.de), fim: String(a.ate) };
  const tipo = (PERIODOS_FIXOS as readonly string[]).includes(String(a.periodo)) ? String(a.periodo) as Exclude<TipoPeriodo, "personalizado"> : "mes";
  return periodoQueContem(tipo, DATA.test(String(a.referencia)) ? String(a.referencia) : hoje);
}

type LinhaNegocio = DadosMetas["negocios"][number] & { stage: { pipeline_id: string } | null; contact: { source: string | null } | null };

async function dadosDasMetas(ctx: CtxGestao, inicio: string, fim: string): Promise<DadosMetas> {
  const de = `${inicio}T00:00:00-03:00`;
  const ate = `${fim}T23:59:59.999-03:00`;
  const [negocios, contatos, atividades, conversas] = await Promise.all([
    todas<LinhaNegocio>((x, y) => ctx.db.from("deals").select("id, value, owner_id, status, contact_id, created_at, closed_at, stage:pipeline_stages(pipeline_id), contact:contacts(source)")
      .eq("org_id", ctx.orgId).or(`created_at.gte.${de},closed_at.gte.${de}`).order("id").range(x, y) as never),
    todas<DadosMetas["contatos"][number]>((x, y) => ctx.db.from("contacts").select("id, owner_id, created_at, source").eq("org_id", ctx.orgId).is("merged_into_id", null)
      .gte("created_at", de).lte("created_at", ate).order("id").range(x, y)),
    todas<DadosMetas["atividades"][number]>((x, y) => ctx.db.from("activities").select("user_id, type, created_at").eq("org_id", ctx.orgId).neq("type", "stage_change")
      .gte("created_at", de).lte("created_at", ate).order("id").range(x, y)),
    todas<DadosMetas["conversas"][number]>((x, y) => ctx.db.from("conversations").select("assigned_to, first_response_minutes, created_at").eq("org_id", ctx.orgId)
      .not("first_response_minutes", "is", null).gte("created_at", de).lte("created_at", ate).order("id").range(x, y)),
  ]);
  return {
    negocios: negocios.map(({ stage, contact, ...n }) => ({ ...n, pipeline_id: stage?.pipeline_id ?? null, origem: contact?.source ?? null })),
    contatos, atividades, conversas,
  };
}

function formatar(metrica: string, valor: number): string {
  const unidade = definicaoDaMetrica(metrica)?.unidade ?? "quantidade";
  if (unidade === "moeda") return moeda(valor);
  if (unidade === "percentual") return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (unidade === "horas") return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
  return String(Math.round(valor));
}

/** Metas do período com realizado e progresso, calculados com as mesmas regras da tela de Metas. */
export async function metas(ctx: CtxGestao, a: Json) {
  const periodo = periodoPedido(a);
  const { data: lista, error } = await ctx.db.from("sales_goals").select("*").eq("org_id", ctx.orgId)
    .lte("period_start", periodo.fim).gte("period_end", periodo.inicio).order("period_start");
  if (error) return { erro: error.message };
  const base = { periodo: rotuloPeriodo(periodo), link: "/sales-goals" };
  let escolhidas = lista ?? [];
  if (a.minhas === true) escolhidas = escolhidas.filter((m) => m.assign_type === "individual" && m.user_id === ctx.userId);
  if (!escolhidas.length) return { ...base, total: 0, metas: [] };

  const inicio = escolhidas.reduce((m, g) => (g.period_start < m ? g.period_start : m), escolhidas[0].period_start as string);
  const fim = escolhidas.reduce((m, g) => (g.period_end > m ? g.period_end : m), escolhidas[0].period_end as string);
  const [dados, { data: pessoas }, funis] = await Promise.all([
    dadosDasMetas(ctx, inicio, fim),
    ctx.db.from("profiles").select("id, full_name").eq("org_id", ctx.orgId),
    ctx.db.from("pipelines").select("id, name").eq("org_id", ctx.orgId),
  ]);
  const nomeDe = new Map((pessoas ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "Usuário"]));
  const nomeDoFunil = new Map((funis.data ?? []).map((f) => [f.id as string, f.name as string]));

  return {
    ...base, total: escolhidas.length,
    metas: escolhidas.map((m) => {
      const filtros = (m.filters ?? {}) as FiltrosMeta;
      const metrica = m.goal_type as Metrica;
      const valor = realizado({ metrica, responsavel: m.assign_type === "individual" ? m.user_id : null, periodo: { inicio: m.period_start, fim: m.period_end }, filtros }, dados);
      const p = progresso(metrica, Number(m.target_value), valor);
      const def = definicaoDaMetrica(metrica);
      return {
        nome: (m.name as string | null)?.trim() || def?.label || metrica,
        mede: def?.label ?? metrica,
        responsavel: m.assign_type === "individual" ? nomeDe.get(m.user_id as string) ?? "Usuário" : "Time inteiro",
        periodo: rotuloPeriodo({ tipo: m.period_kind as TipoPeriodo, inicio: m.period_start, fim: m.period_end }),
        alvo: formatar(metrica, Number(m.target_value)),
        realizado: valor === null ? "sem dados no período" : formatar(metrica, valor),
        progresso: p.semDados ? null : `${p.percentual}%`,
        situacao: p.semDados ? "sem dados" : p.atingiu ? "meta batida" : "em andamento",
        menor_e_melhor: !!def?.menorEMelhor,
        filtros: {
          funil: filtros.pipeline_id ? nomeDoFunil.get(filtros.pipeline_id) ?? "funil removido" : null,
          origem: filtros.origem ?? null,
          valor_minimo: filtros.valor_minimo ? moeda(filtros.valor_minimo) : null,
          tipos_de_atividade: filtros.tipos_atividade ?? null,
        },
      };
    }),
  };
}

/** Pessoas da equipe com papel e carteira aberta. */
export async function equipe(ctx: CtxGestao) {
  const [{ data: pessoas, error }, abertos] = await Promise.all([
    ctx.db.from("profiles").select("id, full_name, email, is_active, is_approved").eq("org_id", ctx.orgId).order("full_name"),
    todas<{ owner_id: string | null; value: number | null }>((de, ate) => ctx.db.from("deals").select("owner_id, value").eq("org_id", ctx.orgId).eq("status", "open").order("id").range(de, ate)),
  ]);
  if (error) return { erro: error.message };
  // user_roles só mostra a própria linha para quem não é admin; has_role responde por qualquer pessoa.
  const papeis = await Promise.all((pessoas ?? []).map(async (p) => {
    const { data, error: e } = await ctx.db.rpc("has_role", { _user_id: p.id, _role: "admin" });
    return [p.id as string, e ? null : data === true ? "administrador" : "membro"] as const;
  }));
  const papelDe = new Map(papeis);
  return {
    link: "/settings/team", total: pessoas?.length ?? 0,
    pessoas: (pessoas ?? []).map((p) => {
      const meus = abertos.filter((d) => d.owner_id === p.id);
      return {
        nome: p.full_name ?? p.email, email: p.email,
        papel: papelDe.get(p.id as string) ?? null,
        situacao: p.is_approved === false ? "aguardando aprovação" : p.is_active === false ? "desativado" : "ativo",
        negocios_abertos: meus.length, valor_aberto: moeda(meus.reduce((t, d) => t + Number(d.value ?? 0), 0)),
      };
    }),
  };
}

export async function produtos(ctx: CtxGestao, a: Json) {
  let q = ctx.db.from("products").select("name, kind, price, billing, unit, is_active, track_stock, stock_quantity, stock_minimum_alert").eq("org_id", ctx.orgId).order("name").limit(LISTA_MAX);
  const t = termo(a.texto);
  if (t) q = q.ilike("name", `%${t}%`);
  const { data, error } = await q;
  if (error) return { erro: error.message };
  return {
    link: "/products", total: data?.length ?? 0,
    produtos: (data ?? []).map((p) => ({
      nome: p.name, tipo: p.kind, preco: moeda(p.price), cobranca: p.billing, unidade: p.unit, ativo: p.is_active !== false,
      estoque: p.track_stock ? { quantidade: p.stock_quantity, baixo: p.stock_minimum_alert != null && Number(p.stock_quantity) <= Number(p.stock_minimum_alert) } : null,
    })),
  };
}

export async function empresas(ctx: CtxGestao, a: Json) {
  let q = ctx.db.from("companies").select("name, industry, size, website, domain, created_at").eq("org_id", ctx.orgId).order("name").limit(LISTA_MAX);
  const t = termo(a.texto);
  if (t) q = q.or(`name.ilike.%${t}%,domain.ilike.%${t}%`);
  const { data, error } = await q;
  if (error) return { erro: error.message };
  return { link: "/companies", total: data?.length ?? 0, empresas: (data ?? []).map((c) => ({ nome: c.name, segmento: c.industry, porte: c.size, site: c.website ?? c.domain })) };
}

/** O que roda sozinho: automações, sequências de e-mail, formulários e campanhas recentes. */
export async function automacoes(ctx: CtxGestao) {
  const [auto, seq, forms, camp] = await Promise.all([
    ctx.db.from("automations").select("name, is_active, trigger, run_count, error_count, last_run_at").eq("org_id", ctx.orgId).order("name").limit(LISTA_MAX),
    ctx.db.from("email_sequences").select("name, is_active").eq("org_id", ctx.orgId).order("name").limit(LISTA_MAX),
    ctx.db.from("capture_forms").select("name, is_active, submissions_count, last_submission_at, slug").eq("org_id", ctx.orgId).order("name").limit(LISTA_MAX),
    ctx.db.from("campaigns").select("name, status, channel, sent_count, total_recipients, scheduled_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(10),
  ]);
  const ou = <T>(r: { data: T[] | null; error: unknown }) => (r.error ? "sem acesso" : r.data ?? []);
  return {
    automacoes: { link: "/settings/automations", itens: ou(auto) === "sem acesso" ? "sem acesso" : (auto.data ?? []).map((x) => ({ nome: x.name, ativa: x.is_active, gatilho: (x.trigger as { type?: string } | null)?.type ?? null, execucoes: x.run_count, erros: x.error_count, ultima_execucao: x.last_run_at })) },
    sequencias_de_email: { link: "/settings/automations?secao=cadencias", itens: ou(seq) },
    formularios: { link: "/settings/capture", itens: ou(forms) === "sem acesso" ? "sem acesso" : (forms.data ?? []).map((f) => ({ nome: f.name, ativo: f.is_active, respostas: f.submissions_count, ultima_resposta: f.last_submission_at, pagina_publica: `/f/${f.slug}` })) },
    campanhas_recentes: { link: "/settings/campaigns", itens: ou(camp) },
  };
}
