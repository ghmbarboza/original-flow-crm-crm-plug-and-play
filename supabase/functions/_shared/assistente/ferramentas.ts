// Ferramentas do assistente do CRM. Todas são de LEITURA e rodam com o client do
// próprio usuário (JWT dele): o RLS decide o que cada pessoa vê, igual à tela.
// Cada resultado traz `link` com o caminho da tela, que o modelo usa nos links.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { FerramentaIA } from "../ai.ts";
import { GUIAS } from "../ajuda/guias.ts";
import { PROBLEMAS } from "../ajuda/problemas.ts";

const LIMITE_PADRAO = 10;
const LIMITE_MAX = 25;
const DIA_MS = 86_400_000;

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
  { name: "buscar_contatos", description: "Busca contatos por nome, e-mail ou telefone, com filtro de status. Use para achar alguém ou listar leads.", parameters: { type: "object", properties: { texto: prop("string", "Nome, e-mail ou telefone (opcional)"), status: prop("string", "lead, prospect, customer ou churned (opcional)"), recentes_dias: prop("number", "Só os criados nos últimos N dias (opcional)"), limite: prop("number", "Máximo de resultados, até 25") } } },
  { name: "ficha_contato", description: "Ficha completa de um contato: dados, o que a IA sabe dele, negócios, próximas reuniões, últimas atividades e ligações.", parameters: { type: "object", properties: { contato_id: prop("string", "id do contato") }, required: ["contato_id"] } },
  { name: "buscar_negocios", description: "Lista negócios com filtros: texto no título, etapa, status, valor mínimo, parados há N dias, só os meus. Ordena por valor ou mais recentes.", parameters: { type: "object", properties: { texto: prop("string", "Parte do título (opcional)"), etapa: prop("string", "Nome da etapa (opcional)"), status: prop("string", "open, won ou lost; padrão open"), valor_minimo: prop("number", "opcional"), parados_dias: prop("number", "Sem atualização há pelo menos N dias (opcional)"), meus: prop("boolean", "Só os do usuário que pergunta"), ordenar: prop("string", "valor ou recentes"), limite: prop("number", "até 25") } } },
  { name: "resumo_funil", description: "Resumo do funil: quantidade e valor por etapa dos negócios abertos, e ganhos/perdidos no período.", parameters: { type: "object", properties: { periodo_dias: prop("number", "Janela para ganhos e perdidos, padrão 30") } } },
  { name: "tarefas", description: "Tarefas e atividades pendentes: atrasadas, de hoje ou próximas. Por padrão as do usuário.", parameters: { type: "object", properties: { situacao: prop("string", "atrasadas, hoje ou proximas"), todas: prop("boolean", "true para ver as de toda a equipe"), limite: prop("number", "até 25") } } },
  { name: "agenda", description: "Reuniões num intervalo de datas (padrão: hoje e os próximos 7 dias).", parameters: { type: "object", properties: { de: prop("string", "Data inicial AAAA-MM-DD"), ate: prop("string", "Data final AAAA-MM-DD"), limite: prop("number", "até 25") } } },
  { name: "conversas", description: "Conversas de atendimento: esperando resposta da equipe, com humano, com a IA, ou com SLA estourado.", parameters: { type: "object", properties: { situacao: prop("string", "aguardando, com_humano, com_ia ou sla_estourado"), limite: prop("number", "até 25") } } },
  { name: "metricas", description: "Números do período: novos contatos por origem, negócios criados, ganhos e perdidos com valores, conversas, ligações e reuniões.", parameters: { type: "object", properties: { periodo_dias: prop("number", "Padrão 30") } } },
  { name: "buscar_conhecimento", description: "Busca na base de conhecimento da empresa (fatos, documentos, FAQs) para responder sobre preço, prazo, políticas e produtos.", parameters: { type: "object", properties: { consulta: prop("string", "O que buscar") }, required: ["consulta"] } },
  { name: "ajuda_plataforma", description: "Como usar a plataforma: guias passo a passo e resolução de problemas, com o caminho de cada tela.", parameters: { type: "object", properties: { tema: prop("string", "O que a pessoa quer fazer ou o problema") }, required: ["tema"] } },
];

/** Telas que existem no app. Link fora disso é inventado e vira texto. */
export const ROTAS_DO_APP = ["/dashboard", "/contacts", "/companies", "/deals", "/tasks", "/agenda", "/voz", "/products", "/whatsapp", "/inbox", "/reports", "/sales-goals", "/lead-scoring", "/settings", "/help", "/email-templates"];

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

async function etapasPorId(ctx: CtxAssistente) {
  const { data } = await ctx.db.from("pipeline_stages").select("id, name, order").eq("org_id", ctx.orgId).order("order");
  return new Map((data ?? []).map((e) => [e.id as string, e as { id: string; name: string; order: number }]));
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
  if (a.etapa) {
    const alvo = semAcento(String(a.etapa));
    const ids = [...etapas.values()].filter((e) => semAcento(e.name).includes(alvo)).map((e) => e.id);
    if (!ids.length) return { erro: `Nenhuma etapa com o nome "${a.etapa}". Etapas: ${[...etapas.values()].map((e) => e.name).join(", ")}` };
    q = q.in("stage_id", ids);
  }
  if (Number(a.valor_minimo) > 0) q = q.gte("value", Number(a.valor_minimo));
  if (Number(a.parados_dias) > 0) q = q.lte("updated_at", new Date(Date.now() - Number(a.parados_dias) * DIA_MS).toISOString());
  if (a.meus === true) q = q.eq("owner_id", ctx.userId);
  q = a.ordenar === "valor" ? q.order("value", { ascending: false, nullsFirst: false }) : q.order("updated_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { erro: error.message };
  return {
    total: data?.length ?? 0,
    negocios: (data ?? []).map((d) => ({
      titulo: d.title, valor: moeda(d.value), etapa: etapas.get(d.stage_id as string)?.name ?? null, contato: nome(d.contacts as never),
      dias_sem_atualizar: Math.floor((Date.now() - new Date(d.updated_at as string).getTime()) / DIA_MS), link: `/deals/${d.id}`,
    })),
  };
}

async function resumoFunil(ctx: CtxAssistente, a: Json) {
  const dias = Math.min(365, Math.max(1, Number(a.periodo_dias) || 30));
  const desde = new Date(Date.now() - dias * DIA_MS).toISOString();
  const etapas = await etapasPorId(ctx);
  const [abertos, fechados] = await Promise.all([
    ctx.db.from("deals").select("stage_id, value").eq("org_id", ctx.orgId).eq("status", "open").limit(5000),
    ctx.db.from("deals").select("status, value").eq("org_id", ctx.orgId).in("status", ["won", "lost"]).gte("updated_at", desde).limit(5000),
  ]);
  const porEtapa = new Map<string, { quantidade: number; valor: number }>();
  for (const d of abertos.data ?? []) {
    const k = etapas.get(d.stage_id as string)?.name ?? "Sem etapa";
    const atual = porEtapa.get(k) ?? { quantidade: 0, valor: 0 };
    porEtapa.set(k, { quantidade: atual.quantidade + 1, valor: atual.valor + Number(d.value ?? 0) });
  }
  const ordem = [...etapas.values()].map((e) => e.name);
  const soma = (s: string) => (fechados.data ?? []).filter((d) => d.status === s).reduce((t, d) => t + Number(d.value ?? 0), 0);
  const conta = (s: string) => (fechados.data ?? []).filter((d) => d.status === s).length;
  return {
    link: "/deals",
    abertos_por_etapa: [...porEtapa.entries()].sort(([x], [y]) => ordem.indexOf(x) - ordem.indexOf(y)).map(([etapa, v]) => ({ etapa, quantidade: v.quantidade, valor: moeda(v.valor) })),
    total_aberto: moeda([...porEtapa.values()].reduce((t, v) => t + v.valor, 0)),
    [`ganhos_${dias}_dias`]: { quantidade: conta("won"), valor: moeda(soma("won")) },
    [`perdidos_${dias}_dias`]: { quantidade: conta("lost"), valor: moeda(soma("lost")) },
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
    const { count } = await ctx.db.from(tabela).select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).gte("created_at", desde);
    return count ?? 0;
  };
  const [contatos, negocios, conversasN, ligacoes, reunioes, fechados] = await Promise.all([
    ctx.db.from("contacts").select("source").eq("org_id", ctx.orgId).is("merged_into_id", null).gte("created_at", desde).limit(10000),
    contar("deals"), contar("conversations"), contar("calls"), contar("appointments"),
    ctx.db.from("deals").select("status, value").eq("org_id", ctx.orgId).in("status", ["won", "lost"]).gte("updated_at", desde).limit(5000),
  ]);
  const porOrigem: Record<string, number> = {};
  for (const c of contatos.data ?? []) porOrigem[c.source ?? "sem origem"] = (porOrigem[c.source ?? "sem origem"] ?? 0) + 1;
  const ganhos = (fechados.data ?? []).filter((d) => d.status === "won");
  const perdidos = (fechados.data ?? []).filter((d) => d.status === "lost");
  return {
    periodo_dias: dias, link: "/reports",
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

export function ajudaPlataforma(a: Json) {
  const palavras = semAcento(String(a.tema ?? "")).split(/\W+/).filter((p) => p.length > 2);
  const pontua = (texto: string) => { const t = semAcento(texto); return palavras.reduce((s, p) => s + (t.includes(p) ? 1 : 0), 0); };
  const guias = GUIAS.map((g) => ({ g, s: pontua(`${g.titulo} ${g.resumo} ${g.palavras ?? ""} ${g.passos.map((p) => p.texto).join(" ")}`) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 3);
  const problemas = PROBLEMAS.map((p) => ({ p, s: pontua(`${p.sintoma} ${p.palavras ?? ""} ${p.causas.join(" ")}`) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 2);
  return {
    guias: guias.map(({ g }) => ({ titulo: g.titulo, para_que: g.paraQue, so_admin: !!g.admin, passos: g.passos.map((p) => (p.link ? `${p.texto} [${p.link.rotulo}](${p.link.to})` : p.texto)), dicas: g.dicas ?? [], tela: g.onde.to, guia_completo: `/help?guia=${g.id}` })),
    problemas: problemas.map(({ p }) => ({ sintoma: p.sintoma, causas: p.causas, como_resolver: p.solucao, tela: p.link.to })),
  };
}

export async function executarFerramentaAssistente(ctx: CtxAssistente, nomeFerramenta: string, args: Json): Promise<string> {
  try {
    const r = nomeFerramenta === "buscar_contatos" ? await buscarContatos(ctx, args)
      : nomeFerramenta === "ficha_contato" ? await fichaContato(ctx, args)
      : nomeFerramenta === "buscar_negocios" ? await buscarNegocios(ctx, args)
      : nomeFerramenta === "resumo_funil" ? await resumoFunil(ctx, args)
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
