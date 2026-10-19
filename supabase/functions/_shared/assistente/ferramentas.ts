// Ferramentas do assistente do CRM. Todas são de LEITURA e rodam com o client do
// próprio usuário (JWT dele): o RLS decide o que cada pessoa vê, igual à tela.
// Cada resultado traz `link` com o caminho da tela, que o modelo usa nos links.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { FerramentaIA } from "../ai.ts";
import { GUIAS } from "../ajuda/guias.ts";
import { PROBLEMAS } from "../ajuda/problemas.ts";
import { automacoes, configuracaoDosFunis, empresas, equipe, metas, produtos, resumoFunil, todas } from "./gestao.ts";

const LIMITE_PADRAO = 10;
const LIMITE_MAX = 25;
const DIA_MS = 86_400_000;
const TAMANHO_MIN_RADICAL = 5;
const PESO_TITULO = 3;
const PESO_RESUMO = 2;
const PESO_TEXTO = 1;
/** Palavras da pergunta que não dizem o assunto. */
const PALAVRAS_VAZIAS = new Set(["como", "para", "que", "onde", "qual", "quais", "fazer", "faco", "posso", "meu", "minha", "meus", "minhas", "uma", "uns", "das", "dos", "nao", "por", "com", "sem", "tem", "esta"]);

type Json = Record<string, unknown>;
const limite = (v: unknown) => Math.min(LIMITE_MAX, Math.max(1, Number(v) || LIMITE_PADRAO));
const nome = (c: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
  c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || "(sem nome)" : null;
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Tira caracteres que quebrariam o filtro `or` do PostgREST. */
const termo = (v: unknown) => String(v ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function prop(tipo: string, descricao: string, extra: Json = {}) {
  return { type: tipo, description: descricao, ...extra };
}

export const FERRAMENTAS_ASSISTENTE: FerramentaIA[] = [
  { name: "estado_da_conta", description: "O que está configurado e funcionando na conta e o que falta: canal de atendimento, IA ligada ou desligada, base de conhecimento, funil, produtos, e-mail, calendário, voz e automações. Use para 'o que falta configurar', 'por que a IA não responde', 'está tudo certo?'.", parameters: { type: "object", properties: {} } },
  { name: "buscar_contatos", description: "Busca contatos por nome, e-mail ou telefone, com filtro de status. Use para achar alguém ou listar leads.", parameters: { type: "object", properties: { texto: prop("string", "Nome, e-mail ou telefone (opcional)"), status: prop("string", "lead, prospect, customer ou churned (opcional)"), recentes_dias: prop("number", "Só os criados nos últimos N dias (opcional)"), limite: prop("number", "Máximo de resultados, até 25") } } },
  { name: "ficha_contato", description: "Ficha completa de um contato: dados, o que a IA sabe dele, negócios, próximas reuniões, últimas atividades e ligações.", parameters: { type: "object", properties: { contato_id: prop("string", "id do contato") }, required: ["contato_id"] } },
  { name: "buscar_negocios", description: "Lista negócios com filtros: texto no título, funil, etapa, status, valor mínimo, parados há N dias, só os meus. Ordena por valor ou mais recentes.", parameters: { type: "object", properties: { texto: prop("string", "Parte do título (opcional)"), funil: prop("string", "Nome do funil (opcional; sem ele busca em todos)"), etapa: prop("string", "Nome da etapa (opcional)"), status: prop("string", "open, won ou lost; padrão open"), valor_minimo: prop("number", "opcional"), parados_dias: prop("number", "Sem atualização há pelo menos N dias (opcional)"), meus: prop("boolean", "Só os do usuário que pergunta"), ordenar: prop("string", "valor ou recentes"), limite: prop("number", "até 25") } } },
  { name: "resumo_funil", description: "Resumo de cada funil: quantidade e valor por etapa dos negócios abertos, e ganhos/perdidos (pela data do fechamento) no período.", parameters: { type: "object", properties: { funil: prop("string", "Nome do funil (opcional; sem ele traz todos)"), periodo_dias: prop("number", "Janela para ganhos e perdidos, padrão 30") } } },
  { name: "funis_configurados", description: "Como os funis estão montados: nomes, qual é o padrão, etapas na ordem e probabilidade de cada etapa.", parameters: { type: "object", properties: {} } },
  { name: "metas", description: "Metas do período com alvo, realizado, progresso e situação (batida, em andamento, sem dados), calculados igual à tela de Metas.", parameters: { type: "object", properties: { periodo: prop("string", "semana, mes, trimestre, semestre ou ano; padrão mes"), referencia: prop("string", "Uma data AAAA-MM-DD dentro do período; padrão hoje"), de: prop("string", "Início AAAA-MM-DD, para período livre"), ate: prop("string", "Fim AAAA-MM-DD, para período livre"), minhas: prop("boolean", "Só as metas individuais do usuário que pergunta") } } },
  { name: "equipe", description: "Pessoas da equipe: papel (administrador ou membro), situação e carteira de negócios abertos de cada uma.", parameters: { type: "object", properties: {} } },
  { name: "produtos", description: "Produtos e serviços cadastrados: tipo, preço, cobrança, se está ativo e estoque.", parameters: { type: "object", properties: { texto: prop("string", "Parte do nome (opcional)") } } },
  { name: "empresas", description: "Empresas (contas) cadastradas, com segmento, porte e site.", parameters: { type: "object", properties: { texto: prop("string", "Parte do nome ou domínio (opcional)") } } },
  { name: "automacoes", description: "O que roda sozinho: automações (gatilho, execuções, erros), sequências de e-mail, formulários de captura e campanhas recentes.", parameters: { type: "object", properties: {} } },
  { name: "tarefas", description: "Tarefas e atividades pendentes: atrasadas, de hoje ou próximas. Por padrão as do usuário.", parameters: { type: "object", properties: { situacao: prop("string", "atrasadas, hoje ou proximas"), todas: prop("boolean", "true para ver as de toda a equipe"), limite: prop("number", "até 25") } } },
  { name: "agenda", description: "Reuniões num intervalo de datas (padrão: hoje e os próximos 7 dias).", parameters: { type: "object", properties: { de: prop("string", "Data inicial AAAA-MM-DD"), ate: prop("string", "Data final AAAA-MM-DD"), limite: prop("number", "até 25") } } },
  { name: "conversas", description: "Conversas de atendimento: esperando resposta da equipe, com humano, com a IA, ou com SLA estourado.", parameters: { type: "object", properties: { situacao: prop("string", "aguardando, com_humano, com_ia ou sla_estourado"), limite: prop("number", "até 25") } } },
  { name: "metricas", description: "Números do período: novos contatos por origem, negócios criados, ganhos e perdidos (pela data do fechamento) com valores, taxa de ganho, conversas, ligações e reuniões.", parameters: { type: "object", properties: { periodo_dias: prop("number", "Padrão 30") } } },
  { name: "buscar_conhecimento", description: "Busca na base de conhecimento da empresa (fatos, documentos, FAQs) para responder sobre preço, prazo, políticas e produtos.", parameters: { type: "object", properties: { consulta: prop("string", "O que buscar") }, required: ["consulta"] } },
  { name: "ajuda_plataforma", description: "Como usar a plataforma: guias passo a passo e resolução de problemas, com o caminho de cada tela.", parameters: { type: "object", properties: { tema: prop("string", "O que a pessoa quer fazer ou o problema") }, required: ["tema"] } },
];

/** Telas que existem no app. Link fora disso é inventado e vira texto. */
export const ROTAS_DO_APP = ["/dashboard", "/contacts", "/companies", "/deals", "/tasks", "/agenda", "/voz", "/products", "/whatsapp", "/inbox", "/reports", "/sales-goals", "/lead-scoring", "/settings", "/help", "/email-templates", "/f"];

export function rotaValida(caminho: string): boolean {
  if (!caminho.startsWith("/") || caminho.startsWith("//")) return false;
  const base = caminho.split(/[?#]/)[0];
  return ROTAS_DO_APP.some((r) => base === r || base.startsWith(`${r}/`));
}

/** Tira o link de caminhos que não são telas do app (o texto do link fica). */
export function limparLinks(texto: string): string {
  return texto.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (inteiro, rotulo: string, destino: string) => (rotaValida(destino) ? inteiro : rotulo));
}

export interface CtxAssistente {
  db: SupabaseClient;
  orgId: string;
  userId: string;
}

interface EtapaComFunil { id: string; name: string; order: number; pipeline_id: string; funil: string | null }

async function etapasPorId(ctx: CtxAssistente) {
  const { data } = await ctx.db.from("pipeline_stages").select("id, name, order, pipeline_id, pipelines(name)").eq("org_id", ctx.orgId).order("order");
  return new Map((data ?? []).map((e) => [e.id as string, { id: e.id, name: e.name, order: e.order, pipeline_id: e.pipeline_id, funil: (e.pipelines as { name?: string } | null)?.name ?? null } as EtapaComFunil]));
}

async function buscarContatos(ctx: CtxAssistente, a: Json) {
  let q = ctx.db.from("contacts").select("id, first_name, last_name, email, whatsapp_phone, phone, status, source, lead_score, created_at")
    .eq("org_id", ctx.orgId).is("merged_into_id", null).order("created_at", { ascending: false }).limit(limite(a.limite));
  const t = termo(a.texto);
  if (t) q = q.or(`first_name.ilike.%${t}%,last_name.ilike.%${t}%,email.ilike.%${t}%,whatsapp_phone.ilike.%${t.replace(/\D/g, "") || t}%`);
  if (["lead", "prospect", "customer", "churned"].includes(String(a.status))) q = q.eq("status", String(a.status));
  if (Number(a.recentes_dias) > 0) q = q.gte("created_at", new Date(Date.now() - Number(a.recentes_dias) * DIA_MS).toISOString());
  const { data, error } = await q;
  if (error) return { erro: error.message };
  return { total: data?.length ?? 0, contatos: (data ?? []).map((c) => ({ nome: nome(c), email: c.email, telefone: c.whatsapp_phone ?? c.phone, status: c.status, origem: c.source, pontuacao: c.lead_score, criado_em: c.created_at, link: `/contacts/${c.id}` })) };
}

async function fichaContato(ctx: CtxAssistente, a: Json) {
  const id = String(a.contato_id ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { erro: "contato_id inválido; use buscar_contatos antes." };
  const { data: c } = await ctx.db.from("contacts").select("id, first_name, last_name, email, whatsapp_phone, phone, title, status, source, lead_score, client_memory, created_at, companies(name)").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
  if (!c) return { erro: "Contato não encontrado ou sem acesso." };
  const agora = new Date().toISOString();
  const [deals, reunioes, atividades, ligacoes] = await Promise.all([
    ctx.db.from("deals").select("id, title, value, status, stage_id, updated_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(5),
    ctx.db.from("appointments").select("title, starts_at, status").eq("contact_id", id).gte("starts_at", agora).order("starts_at").limit(3),
    ctx.db.from("activities").select("type, title, due_date, completed_at, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(8),
    ctx.db.from("calls").select("direction, status, summary, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(3),
  ]);
  const etapas = await etapasPorId(ctx);
  const memoria = (c.client_memory ?? {}) as { lead_state?: Record<string, { value?: string | null; status?: string }>; sales_intelligence?: { summary?: string | null; score?: number | null } };
  const campos = Object.fromEntries(Object.entries(memoria.lead_state ?? {}).filter(([, v]) => v?.value).map(([k, v]) => [k, `${v.value} (${v.status === "confirmed" ? "confirmado" : "inferido"})`]));
  return {
    nome: nome(c), link: `/contacts/${c.id}`, email: c.email, telefone: c.whatsapp_phone ?? c.phone, cargo: c.title, status: c.status, origem: c.source, pontuacao: c.lead_score,
    empresa: (c.companies as { name?: string } | null)?.name ?? null,
    o_que_a_ia_sabe: { ...campos, resumo: memoria.sales_intelligence?.summary ?? null },
    negocios: (deals.data ?? []).map((d) => ({ titulo: d.title, valor: moeda(d.value), status: d.status, etapa: etapas.get(d.stage_id as string)?.name ?? null, link: `/deals/${d.id}` })),
    proximas_reunioes: (reunioes.data ?? []).map((r) => ({ titulo: r.title, quando: r.starts_at, status: r.status, link: "/agenda" })),
    ultimas_atividades: (atividades.data ?? []).map((t) => ({ tipo: t.type, titulo: t.title, prazo: t.due_date, concluida: !!t.completed_at })),
    ultimas_ligacoes: (ligacoes.data ?? []).map((l) => ({ direcao: l.direction, status: l.status, resumo: l.summary, quando: l.created_at, link: "/voz?secao=ligacoes" })),
  };
}

async function buscarNegocios(ctx: CtxAssistente, a: Json) {
  const etapas = await etapasPorId(ctx);
  const status = ["open", "won", "lost"].includes(String(a.status)) ? String(a.status) : "open";
  let q = ctx.db.from("deals").select("id, title, value, status, stage_id, owner_id, updated_at, created_at, contacts(first_name, last_name)").eq("org_id", ctx.orgId).eq("status", status).limit(limite(a.limite));
  const t = termo(a.texto);
  if (t) q = q.ilike("title", `%${t}%`);
  let candidatas = [...etapas.values()];
  if (a.funil) {
    const alvo = semAcento(String(a.funil));
    candidatas = candidatas.filter((e) => e.funil && semAcento(e.funil).includes(alvo));
    if (!candidatas.length) return { erro: `Nenhum funil com o nome "${a.funil}". Funis: ${[...new Set([...etapas.values()].map((e) => e.funil).filter(Boolean))].join(", ")}` };
  }
  if (a.etapa) {
    const alvo = semAcento(String(a.etapa));
    candidatas = candidatas.filter((e) => semAcento(e.name).includes(alvo));
    if (!candidatas.length) return { erro: `Nenhuma etapa com o nome "${a.etapa}". Etapas: ${[...etapas.values()].map((e) => `${e.name} (${e.funil ?? "sem funil"})`).join(", ")}` };
  }
  if (a.funil || a.etapa) q = q.in("stage_id", candidatas.map((e) => e.id));
  if (Number(a.valor_minimo) > 0) q = q.gte("value", Number(a.valor_minimo));
  if (Number(a.parados_dias) > 0) q = q.lte("updated_at", new Date(Date.now() - Number(a.parados_dias) * DIA_MS).toISOString());
  if (a.meus === true) q = q.eq("owner_id", ctx.userId);
  q = a.ordenar === "valor" ? q.order("value", { ascending: false, nullsFirst: false }) : q.order("updated_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { erro: error.message };
  return {
    total: data?.length ?? 0,
    negocios: (data ?? []).map((d) => ({
      titulo: d.title, valor: moeda(d.value), funil: etapas.get(d.stage_id as string)?.funil ?? null, etapa: etapas.get(d.stage_id as string)?.name ?? null, contato: nome(d.contacts as never),
      dias_sem_atualizar: Math.floor((Date.now() - new Date(d.updated_at as string).getTime()) / DIA_MS), link: `/deals/${d.id}`,
    })),
  };
}

async function tarefas(ctx: CtxAssistente, a: Json) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje.getTime() + DIA_MS);
  let q = ctx.db.from("activities").select("id, type, title, due_date, user_id, contacts(first_name, last_name), contact_id, deal_id").eq("org_id", ctx.orgId).is("completed_at", null).not("due_date", "is", null).order("due_date").limit(limite(a.limite));
  if (a.todas !== true) q = q.eq("user_id", ctx.userId);
  if (a.situacao === "atrasadas") q = q.lt("due_date", hoje.toISOString());
  else if (a.situacao === "hoje") q = q.gte("due_date", hoje.toISOString()).lt("due_date", amanha.toISOString());
  else q = q.gte("due_date", hoje.toISOString());
  const { data, error } = await q;
  if (error) return { erro: error.message };
  return { total: data?.length ?? 0, link: "/tasks", tarefas: (data ?? []).map((t) => ({ tipo: t.type, titulo: t.title, prazo: t.due_date, contato: nome(t.contacts as never), link: t.deal_id ? `/deals/${t.deal_id}` : t.contact_id ? `/contacts/${t.contact_id}` : "/tasks" })) };
}

async function agenda(ctx: CtxAssistente, a: Json) {
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(a.de)) ? new Date(`${a.de}T00:00:00-03:00`) : new Date(new Date().setHours(0, 0, 0, 0));
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(a.ate)) ? new Date(`${a.ate}T23:59:59-03:00`) : new Date(de.getTime() + 8 * DIA_MS);
  const { data, error } = await ctx.db.from("appointments").select("title, starts_at, ends_at, status, meeting_url, contact_id, contacts(first_name, last_name)").eq("org_id", ctx.orgId).gte("starts_at", de.toISOString()).lte("starts_at", ate.toISOString()).neq("status", "cancelled").order("starts_at").limit(limite(a.limite));
  if (error) return { erro: error.message };
  return { total: data?.length ?? 0, link: "/agenda", reunioes: (data ?? []).map((r) => ({ titulo: r.title, inicio: r.starts_at, status: r.status, contato: nome(r.contacts as never), sala: r.meeting_url, link: r.contact_id ? `/contacts/${r.contact_id}` : "/agenda" })) };
}

async function conversas(ctx: CtxAssistente, a: Json) {
  let q = ctx.db.from("conversations").select("id, status, channel, channel_contact_name, last_message_at, last_message_preview, unread_count, sla_breached, contacts(first_name, last_name)").eq("org_id", ctx.orgId).neq("status", "closed").order("last_message_at", { ascending: false }).limit(limite(a.limite));
  if (a.situacao === "com_humano") q = q.eq("status", "human_takeover");
  else if (a.situacao === "com_ia") q = q.eq("status", "ai_active");
  else if (a.situacao === "sla_estourado") q = q.eq("sla_breached", true);
  else q = q.gt("unread_count", 0);
  const { data, error } = await q;
  if (error) return { erro: error.message };
  return { total: data?.length ?? 0, conversas: (data ?? []).map((v) => ({ contato: nome(v.contacts as never) ?? v.channel_contact_name, canal: v.channel, com: v.status === "human_takeover" ? "humano" : "IA", nao_lidas: v.unread_count, ultima_mensagem: v.last_message_preview, quando: v.last_message_at, link: `/whatsapp?conversa=${v.id}` })) };
}

async function metricas(ctx: CtxAssistente, a: Json) {
  const dias = Math.min(365, Math.max(1, Number(a.periodo_dias) || 30));
  const desde = new Date(Date.now() - dias * DIA_MS).toISOString();
  const contar = async (tabela: string) => {
    const { count, error } = await ctx.db.from(tabela).select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).gte("created_at", desde);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    return count ?? 0;
  };
  const [contatosLidos, negocios, conversasN, ligacoes, reunioes, fechadosLidos] = await Promise.all([
    todas<{ source: string | null }>((de, ate) => ctx.db.from("contacts").select("source").eq("org_id", ctx.orgId).is("merged_into_id", null).gte("created_at", desde).order("id").range(de, ate)),
    contar("deals"), contar("conversations"), contar("calls"), contar("appointments"),
    todas<{ status: string; value: number | null }>((de, ate) => ctx.db.from("deals").select("status, value").eq("org_id", ctx.orgId).in("status", ["won", "lost"]).gte("closed_at", desde).order("id").range(de, ate)),
  ]);
  const contatos = { data: contatosLidos };
  const fechados = { data: fechadosLidos };
  const porOrigem: Record<string, number> = {};
  for (const c of contatos.data ?? []) porOrigem[c.source ?? "sem origem"] = (porOrigem[c.source ?? "sem origem"] ?? 0) + 1;
  const ganhos = (fechados.data ?? []).filter((d) => d.status === "won");
  const perdidos = (fechados.data ?? []).filter((d) => d.status === "lost");
  return {
    periodo_dias: dias, link: "/dashboard",
    novos_contatos: contatos.data?.length ?? 0, novos_contatos_por_origem: porOrigem,
    negocios_criados: negocios, ganhos: { quantidade: ganhos.length, valor: moeda(ganhos.reduce((t, d) => t + Number(d.value ?? 0), 0)) },
    perdidos: { quantidade: perdidos.length, valor: moeda(perdidos.reduce((t, d) => t + Number(d.value ?? 0), 0)) },
    taxa_de_ganho: ganhos.length + perdidos.length ? `${Math.round((ganhos.length / (ganhos.length + perdidos.length)) * 100)}%` : null,
    conversas_iniciadas: conversasN, ligacoes: ligacoes, reunioes_marcadas: reunioes,
  };
}

async function buscarConhecimento(ctx: CtxAssistente, a: Json) {
  const consulta = String(a.consulta ?? "").trim().slice(0, 300);
  if (!consulta) return { erro: "Informe a consulta." };
  const { data, error } = await ctx.db.rpc("buscar_conhecimento", { p_org: ctx.orgId, p_consulta: consulta, p_limite: 6 });
  if (error) return { erro: error.message };
  return { link: "/settings/ia?aba=knowledge", resultados: ((data ?? []) as { source_type: string; title: string; content: string }[]).map((r) => ({ tipo: r.source_type, fonte: r.title, conteudo: r.content.slice(0, 800) })) };
}

/** Radical simples: tira a flexão do fim ("importo" e "importar" viram "impor"). */
const radical = (p: string) => (p.length >= TAMANHO_MIN_RADICAL + 1 ? p.slice(0, p.length - 2) : p);

export function ajudaPlataforma(a: Json) {
  const palavras = semAcento(String(a.tema ?? "")).split(/\W+/).filter((p) => p.length > 2 && !PALAVRAS_VAZIAS.has(p)).map(radical);
  // Cada palavra vale o peso do campo mais forte onde aparece: achar no título
  // ou nos sinônimos pesa mais que achar no meio dos passos de um guia longo.
  const pontua = (campos: [string, number][]) => {
    const normalizados = campos.map(([texto, peso]) => [semAcento(texto), peso] as const);
    return palavras.reduce((s, p) => s + Math.max(0, ...normalizados.filter(([t]) => t.includes(p)).map(([, peso]) => peso)), 0);
  };
  const guias = GUIAS.map((g) => ({ g, s: pontua([[`${g.titulo} ${g.palavras ?? ""}`, PESO_TITULO], [`${g.resumo} ${g.paraQue}`, PESO_RESUMO], [[...g.passos.map((p) => p.texto), ...(g.dicas ?? [])].join(" "), PESO_TEXTO]]) }))
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 3);
  const problemas = PROBLEMAS.map((p) => ({ p, s: pontua([[`${p.sintoma} ${p.palavras ?? ""}`, PESO_TITULO], [p.causas.join(" "), PESO_TEXTO]]) }))
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 2);
  return {
    guias: guias.map(({ g }) => ({ titulo: g.titulo, para_que: g.paraQue, so_admin: !!g.admin, passos: g.passos.map((p) => (p.link ? `${p.texto} [${p.link.rotulo}](${p.link.to})` : p.texto)), dicas: g.dicas ?? [], tela: g.onde.to, guia_completo: `/help?guia=${g.id}` })),
    problemas: problemas.map(({ p }) => ({ sintoma: p.sintoma, causas: p.causas, como_resolver: p.solucao, tela: p.link.to })),
  };
}

async function estadoDaConta(ctx: CtxAssistente) {
  const contar = async (tabela: string) => (await ctx.db.from(tabela).select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId)).count ?? 0;
  const [contas, evo, meta, zer, ia, chaves, gmail, cal, funis, etapas, conhecimento, docs, produtosN, automacoesN] = await Promise.all([
    ctx.db.from("channel_accounts").select("provider, label, role, ai_enabled").eq("org_id", ctx.orgId).eq("is_active", true),
    ctx.db.from("evolution_configs").select("status").eq("org_id", ctx.orgId),
    ctx.db.from("meta_configs").select("webhook_verified, is_active").eq("org_id", ctx.orgId),
    ctx.db.from("zernio_configs").select("status").eq("org_id", ctx.orgId).maybeSingle(),
    ctx.db.from("ai_messaging_config").select("is_active, working_hours, voice_enabled").eq("org_id", ctx.orgId).maybeSingle(),
    ctx.db.from("api_keys_registry").select("service_name, is_active").eq("org_id", ctx.orgId),
    ctx.db.from("email_connections").select("id").eq("org_id", ctx.orgId).limit(1).maybeSingle(),
    ctx.db.from("calendar_integrations").select("id").eq("user_id", ctx.userId).limit(1).maybeSingle(),
    contar("pipelines"), contar("pipeline_stages"), contar("knowledge_facts"), contar("knowledge_documents"), contar("products"), contar("automations"),
  ]);
  const numeros = ((contas.data ?? []) as { provider: string; label: string; role: string; ai_enabled: boolean }[])
    .map((c) => `${c.label} (${c.provider}, papel ${c.role}${c.ai_enabled ? "" : ", IA desligada"})`);
  const provedor = numeros.length
    ? [...new Set(((contas.data ?? []) as { provider: string }[]).map((c) => c.provider))].join(", ")
    : null;
  const evolucoes = evo.data ?? [];
  const metas = meta.data ?? [];
  const conectado = evolucoes.some((e) => e.status === "connected") || metas.some((m) => m.webhook_verified && m.is_active !== false) || ["connected", "active"].includes(String(zer.data?.status ?? ""));
  const canal = conectado ? "conectado" : (evolucoes.length || metas.length || zer.data) ? "configurado, aguardando pareamento" : "não conectado (ou sem permissão para ver)";
  const tem = new Set((chaves.data ?? []).filter((k) => k.is_active !== false).map((k) => k.service_name as string));
  return {
    canal_de_atendimento: { situacao: canal, provedor, numeros, link: "/settings/integrations?integration=channels" },
    ia: { ligada: ia.data?.is_active === true, horario_restrito: !!ia.data?.working_hours && Object.keys(ia.data.working_hours as object).length > 0, link: "/settings/ia" },
    base_de_conhecimento: { fatos_e_documentos: conhecimento + docs, link: "/settings/ia?aba=knowledge" },
    funil: { funis, etapas, link: "/settings/automations?secao=funil" },
    ia_provedor: { chave_propria: ["openai", "anthropic", "gemini"].filter((s) => tem.has(s)), observacao: "Sem chave própria a IA da plataforma responde; com chave, ela vira reserva.", link: "/settings/integrations?integration=ia" },
    produtos_servicos: { cadastrados: produtosN, link: "/products" },
    email: { gmail_conectado: !!gmail.data, resend_com_chave: tem.has("resend"), link: "/settings/integrations?integration=gmail" },
    calendario_do_usuario: { conectado: !!cal.data, credenciais_nylas: tem.has("nylas_client_id") && tem.has("nylas_api_key"), link: "/settings/agenda" },
    voz: { resposta_em_audio: ia.data?.voice_enabled === true, credenciais_twilio: tem.has("twilio_account_sid") && tem.has("twilio_auth_token"), chave_elevenlabs: tem.has("elevenlabs"), link: "/voz" },
    automacoes: { criadas: automacoesN, link: "/settings/automations" },
    painel_completo: "/help",
  };
}

export async function executarFerramentaAssistente(ctx: CtxAssistente, nomeFerramenta: string, args: Json): Promise<string> {
  try {
    const r = nomeFerramenta === "estado_da_conta" ? await estadoDaConta(ctx)
      : nomeFerramenta === "buscar_contatos" ? await buscarContatos(ctx, args)
      : nomeFerramenta === "ficha_contato" ? await fichaContato(ctx, args)
      : nomeFerramenta === "buscar_negocios" ? await buscarNegocios(ctx, args)
      : nomeFerramenta === "resumo_funil" ? await resumoFunil(ctx, args)
      : nomeFerramenta === "funis_configurados" ? await configuracaoDosFunis(ctx)
      : nomeFerramenta === "metas" ? await metas(ctx, args)
      : nomeFerramenta === "equipe" ? await equipe(ctx)
      : nomeFerramenta === "produtos" ? await produtos(ctx, args)
      : nomeFerramenta === "empresas" ? await empresas(ctx, args)
      : nomeFerramenta === "automacoes" ? await automacoes(ctx)
      : nomeFerramenta === "tarefas" ? await tarefas(ctx, args)
      : nomeFerramenta === "agenda" ? await agenda(ctx, args)
      : nomeFerramenta === "conversas" ? await conversas(ctx, args)
      : nomeFerramenta === "metricas" ? await metricas(ctx, args)
      : nomeFerramenta === "buscar_conhecimento" ? await buscarConhecimento(ctx, args)
      : nomeFerramenta === "ajuda_plataforma" ? ajudaPlataforma(args)
      : { erro: "Ferramenta desconhecida." };
    return JSON.stringify(r);
  } catch (e) {
    return JSON.stringify({ erro: e instanceof Error ? e.message : String(e) });
  }
}
