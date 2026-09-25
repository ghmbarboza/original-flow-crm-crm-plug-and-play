// Núcleo da importação universal (Sprint 12 B8/B9): grava lotes de linhas já
// mapeadas para contatos, empresas, negócios e atividades. Usado pela function
// import-run (CSV pela tela) e pelo crm-connect (sincronização com outros CRMs).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STATUS_CONTATO = new Set(["lead", "prospect", "customer", "churned"]);
const STATUS_NEGOCIO = new Set(["open", "won", "lost"]);
const TIPOS_ATIVIDADE = new Set(["call", "email", "meeting", "note", "task"]);
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NOME = 200;

export type Dados = Record<string, string>;
export type Resultado = { row_number: number; status: "created" | "updated" | "skipped" | "error"; entity_type?: string; entity_id?: string; error?: string };

export interface Ctx {
  admin: SupabaseClient;
  orgId: string;
  importId: string;
  kind: string;
  mapaEtapas: Record<string, string>;
  cacheUsuarios: Map<string, string | null>;
  cacheEmpresas: Map<string, string>;
  cacheEtapas: { id: string; name: string; pipeline_id: string; win_probability: number }[] | null;
  /** Buscas-ou-criações em andamento: linhas paralelas com a mesma empresa ou tag esperam a mesma promessa. */
  emAndamento: Map<string, Promise<unknown>>;
}

/** Linhas processadas ao mesmo tempo por lote (contatos e empresas). */
const PARALELO = 6;

function umaVez<T>(ctx: Ctx, chave: string, fn: () => Promise<T>): Promise<T> {
  const atual = ctx.emAndamento.get(chave) as Promise<T> | undefined;
  if (atual) return atual;
  const p = fn();
  ctx.emAndamento.set(chave, p);
  return p;
}

const texto = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};
const digitos = (v: string | null) => (v ?? "").replace(/\D/g, "");

function numero(v: string | null): number | null {
  if (!v) return null;
  const limpo = v.replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  const n = Number(limpo.lastIndexOf(",") > limpo.lastIndexOf(".") ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function data(v: string | null): string | null {
  if (!v) return null;
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    const d = new Date(Date.UTC(Number(ano), Number(br[2]) - 1, Number(br[1]), Number(br[4] ?? 12), Number(br[5] ?? 0)));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizar(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** custom:<chave> vira custom_fields e garante a definição do campo. */
async function camposExtras(ctx: Ctx, entity: "contact" | "company" | "deal", d: Dados): Promise<Record<string, string>> {
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (!k.startsWith("custom:")) continue;
    const chave = k.slice(7).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!chave) continue;
    extras[chave] = v;
  }
  for (const chave of Object.keys(extras)) {
    await ctx.admin.from("custom_field_definitions").upsert(
      { org_id: ctx.orgId, entity_type: entity, field_key: chave, field_label: chave.replace(/_/g, " "), field_type: "text" },
      { onConflict: "org_id,entity_type,field_key", ignoreDuplicates: true },
    );
  }
  return extras;
}

async function usuarioPorEmail(ctx: Ctx, email: string | null): Promise<string | null> {
  if (!email) return null;
  const chave = email.toLowerCase();
  if (ctx.cacheUsuarios.has(chave)) return ctx.cacheUsuarios.get(chave)!;
  const { data } = await ctx.admin.from("profiles").select("id").eq("org_id", ctx.orgId).ilike("email", chave).maybeSingle();
  const id = (data?.id as string | undefined) ?? null;
  ctx.cacheUsuarios.set(chave, id);
  return id;
}

async function empresaPorNome(ctx: Ctx, nome: string | null, criar: boolean, externo: string | null = null): Promise<{ id: string; criada: boolean } | null> {
  if (externo) {
    const { data } = await ctx.admin.from("companies").select("id").eq("org_id", ctx.orgId).eq("custom_fields->>external_id", externo).limit(1).maybeSingle();
    if (data) return { id: data.id, criada: false };
  }
  if (!nome) return null;
  const chave = normalizar(nome);
  if (ctx.cacheEmpresas.has(chave)) return { id: ctx.cacheEmpresas.get(chave)!, criada: false };
  return umaVez(ctx, `empresa:${criar}:${chave}`, async () => {
    const { data } = await ctx.admin.from("companies").select("id").eq("org_id", ctx.orgId).ilike("name", nome).limit(1).maybeSingle();
    if (data) { ctx.cacheEmpresas.set(chave, data.id); return { id: data.id, criada: false }; }
    if (!criar) return null;
    const { data: nova, error } = await ctx.admin.from("companies").insert({ org_id: ctx.orgId, name: nome }).select("id").single();
    if (error || !nova) return null;
    ctx.cacheEmpresas.set(chave, nova.id);
    return { id: nova.id, criada: true };
  });
}

async function contatoPorReferencia(ctx: Ctx, d: Dados) {
  const externo = texto(d.external_id);
  const contatoExterno = texto(d.contact_external_id);
  if (contatoExterno) {
    const { data } = await ctx.admin.from("contacts").select("id, custom_fields").eq("org_id", ctx.orgId).is("merged_into_id", null)
      .eq("custom_fields->>external_id", contatoExterno).limit(1).maybeSingle();
    if (data) return data;
  }
  const email = texto(d.email ?? d.contact_email)?.toLowerCase() ?? null;
  const fone = digitos(texto(d.whatsapp_phone ?? d.phone ?? d.contact_phone));
  const base = ctx.admin.from("contacts").select("id, custom_fields").eq("org_id", ctx.orgId).is("merged_into_id", null);
  if (externo) {
    const { data } = await base.eq("custom_fields->>external_id", externo).limit(1).maybeSingle();
    if (data) return data;
  }
  if (email) {
    const { data } = await ctx.admin.from("contacts").select("id, custom_fields").eq("org_id", ctx.orgId).is("merged_into_id", null).ilike("email", email).limit(1).maybeSingle();
    if (data) return data;
  }
  if (fone.length >= 10) {
    const fim = fone.slice(-10);
    const { data } = await ctx.admin.from("contacts").select("id, custom_fields").eq("org_id", ctx.orgId).is("merged_into_id", null)
      .or(`whatsapp_phone.like.%${fim},phone.like.%${fim}`).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function etapas(ctx: Ctx) {
  if (!ctx.cacheEtapas) {
    const { data } = await ctx.admin.from("pipeline_stages").select("id, name, pipeline_id, win_probability").eq("org_id", ctx.orgId).order("order");
    ctx.cacheEtapas = (data ?? []) as Ctx["cacheEtapas"];
  }
  return ctx.cacheEtapas!;
}

async function etapaDaLinha(ctx: Ctx, nomeOrigem: string | null, pipelineNome: string | null) {
  const lista = await etapas(ctx);
  if (nomeOrigem && ctx.mapaEtapas[nomeOrigem]) {
    const m = lista.find((e) => e.id === ctx.mapaEtapas[nomeOrigem]);
    if (m) return m;
  }
  if (nomeOrigem) {
    const n = normalizar(nomeOrigem);
    const igual = lista.find((e) => normalizar(e.name) === n);
    if (igual) return igual;
  }
  if (pipelineNome) {
    const { data: p } = await ctx.admin.from("pipelines").select("id").eq("org_id", ctx.orgId).ilike("name", pipelineNome).maybeSingle();
    if (p) return lista.find((e) => e.pipeline_id === p.id) ?? lista[0] ?? null;
  }
  return lista[0] ?? null;
}

// ---------------------------------------------------------------------------

async function importarContato(ctx: Ctx, d: Dados): Promise<Resultado> {
  const nome = texto(d.name);
  const first = texto(d.first_name) ?? (nome ? nome.split(/\s+/)[0] : null);
  const last = texto(d.last_name) ?? (nome ? nome.split(/\s+/).slice(1).join(" ") || null : null);
  const email = texto(d.email)?.toLowerCase() ?? null;
  const fone = texto(d.phone);
  const whatsapp = digitos(texto(d.whatsapp_phone)) || null;
  if (!first && !email && !whatsapp && !fone) return { row_number: 0, status: "error", error: "Linha sem nome, e-mail ou telefone." };
  // Estresse de entradas (25/09/2026): "sem-arroba" virava e-mail de contato e todas as
  // linhas com o mesmo lixo caíam no mesmo registro. E-mail malformado é erro da linha.
  if (email && !EMAIL_VALIDO.test(email)) return { row_number: 0, status: "error", error: `E-mail inválido: ${email.slice(0, 60)}` };
  if (fone && digitos(fone).length < 8) return { row_number: 0, status: "error", error: `Telefone inválido: ${fone.slice(0, 40)}` };
  if ((first?.length ?? 0) > MAX_NOME || (last?.length ?? 0) > MAX_NOME) return { row_number: 0, status: "error", error: `Nome com mais de ${MAX_NOME} caracteres.` };

  const status = texto(d.status)?.toLowerCase();
  const empresa = await empresaPorNome(ctx, texto(d.company), true, texto(d.company_external_id));
  const dono = await usuarioPorEmail(ctx, texto(d.owner_email));
  const extras = await camposExtras(ctx, "contact", d);
  const externo = texto(d.external_id);
  const campos: Record<string, unknown> = {
    ...(first ? { first_name: first } : {}),
    ...(last !== null ? { last_name: last } : {}),
    ...(email ? { email } : {}),
    ...(fone ? { phone: fone } : {}),
    ...(whatsapp ? { whatsapp_phone: whatsapp } : {}),
    ...(texto(d.title) ? { title: texto(d.title) } : {}),
    ...(status && STATUS_CONTATO.has(status) ? { status } : {}),
    ...(texto(d.source) ? { source: texto(d.source) } : {}),
    ...(empresa ? { company_id: empresa.id } : {}),
    ...(dono ? { owner_id: dono } : {}),
  };

  const existente = await contatoPorReferencia(ctx, d);
  const custom = { ...((existente?.custom_fields as Record<string, unknown>) ?? {}), ...extras, ...(externo ? { external_id: externo } : {}) };
  if (existente) {
    const { error } = await ctx.admin.from("contacts").update({ ...campos, custom_fields: custom, updated_at: new Date().toISOString() }).eq("id", existente.id);
    if (error) return { row_number: 0, status: "error", error: error.message };
    await aplicarTags(ctx, existente.id, texto(d.tags));
    return { row_number: 0, status: "updated", entity_type: "contact", entity_id: existente.id };
  }
  const criado = data(texto(d.created_at));
  const { data: novo, error } = await ctx.admin.from("contacts").insert({
    org_id: ctx.orgId, first_name: first ?? email ?? whatsapp ?? "Contato", ...campos, custom_fields: custom,
    source: texto(d.source) ?? `importação`, ...(criado ? { created_at: criado } : {}),
  }).select("id").single();
  if (error?.code === "23505") {
    // Outra execução (a mesma importação disparada duas vezes, ou o formulário)
    // criou o contato entre a busca e o insert: quem chega depois atualiza.
    const vencedor = await contatoPorReferencia(ctx, d);
    if (vencedor) {
      const { error: e2 } = await ctx.admin.from("contacts").update({ ...campos, custom_fields: { ...((vencedor.custom_fields as Record<string, unknown>) ?? {}), ...custom }, updated_at: new Date().toISOString() }).eq("id", vencedor.id);
      if (e2) return { row_number: 0, status: "error", error: e2.message };
      await aplicarTags(ctx, vencedor.id, texto(d.tags));
      return { row_number: 0, status: "updated", entity_type: "contact", entity_id: vencedor.id };
    }
  }
  if (error || !novo) return { row_number: 0, status: "error", error: error?.message ?? "falha ao criar" };
  await aplicarTags(ctx, novo.id, texto(d.tags));
  return { row_number: 0, status: "created", entity_type: "contact", entity_id: novo.id };
}

async function aplicarTags(ctx: Ctx, contactId: string, tags: string | null) {
  if (!tags) return;
  for (const nome of tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10)) {
    const tagId = await umaVez(ctx, `tag:${normalizar(nome)}`, async () => {
      const { data: existente } = await ctx.admin.from("tags").select("id").eq("org_id", ctx.orgId).ilike("name", nome).limit(1).maybeSingle();
      if (existente?.id) return existente.id as string;
      const { data: nova } = await ctx.admin.from("tags").insert({ org_id: ctx.orgId, name: nome }).select("id").single();
      return nova?.id as string | undefined;
    });
    if (tagId) await ctx.admin.from("contact_tags").upsert({ contact_id: contactId, tag_id: tagId }, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
  }
}

async function importarEmpresa(ctx: Ctx, d: Dados): Promise<Resultado> {
  const nome = texto(d.name);
  const dominio = texto(d.domain)?.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") ?? null;
  if (!nome && !dominio) return { row_number: 0, status: "error", error: "Linha sem nome nem domínio." };
  const externo = texto(d.external_id);
  const dono = await usuarioPorEmail(ctx, texto(d.owner_email));
  const extras = await camposExtras(ctx, "company", d);
  let existente: { id: string; custom_fields: unknown } | null = null;
  if (externo) {
    const { data } = await ctx.admin.from("companies").select("id, custom_fields").eq("org_id", ctx.orgId).eq("custom_fields->>external_id", externo).limit(1).maybeSingle();
    existente = data;
  }
  if (!existente && dominio) {
    const { data } = await ctx.admin.from("companies").select("id, custom_fields").eq("org_id", ctx.orgId).ilike("domain", dominio).limit(1).maybeSingle();
    existente = data;
  }
  if (!existente && nome) {
    const { data } = await ctx.admin.from("companies").select("id, custom_fields").eq("org_id", ctx.orgId).ilike("name", nome).limit(1).maybeSingle();
    existente = data;
  }
  const campos = {
    ...(nome ? { name: nome } : {}),
    ...(dominio ? { domain: dominio } : {}),
    ...(texto(d.industry) ? { industry: texto(d.industry) } : {}),
    ...(texto(d.size) ? { size: texto(d.size) } : {}),
    ...(texto(d.website) ? { website: texto(d.website) } : {}),
    ...(dono ? { owner_id: dono } : {}),
  };
  const custom = { ...((existente?.custom_fields as Record<string, unknown>) ?? {}), ...extras, ...(externo ? { external_id: externo } : {}) };
  if (existente) {
    const { error } = await ctx.admin.from("companies").update({ ...campos, custom_fields: custom, updated_at: new Date().toISOString() }).eq("id", existente.id);
    if (error) return { row_number: 0, status: "error", error: error.message };
    return { row_number: 0, status: "updated", entity_type: "company", entity_id: existente.id };
  }
  const { data: nova, error } = await ctx.admin.from("companies").insert({ org_id: ctx.orgId, name: nome ?? dominio!, ...campos, custom_fields: custom }).select("id").single();
  if (error || !nova) return { row_number: 0, status: "error", error: error?.message ?? "falha ao criar" };
  ctx.cacheEmpresas.set(normalizar(nome ?? dominio!), nova.id);
  return { row_number: 0, status: "created", entity_type: "company", entity_id: nova.id };
}

async function importarNegocio(ctx: Ctx, d: Dados): Promise<Resultado> {
  const titulo = texto(d.title);
  const externo = texto(d.external_id);
  if (!titulo && !externo) return { row_number: 0, status: "error", error: "Linha sem título." };

  let contato = await contatoPorReferencia(ctx, d);
  if (!contato && texto(d.contact_name)) {
    const nome = texto(d.contact_name)!;
    // Nome vem do CRM de origem: filtro parametrizado (ilike), sem montar string de filtro.
    const primeiroNome = nome.split(/\s+/)[0].replace(/[%_,()]/g, "");
    const { data } = primeiroNome
      ? await ctx.admin.from("contacts").select("id, custom_fields").eq("org_id", ctx.orgId).is("merged_into_id", null).ilike("first_name", `${primeiroNome}%`).limit(20)
      : { data: [] as { id: string; custom_fields: unknown }[] };
    contato = (data ?? [])[0] ?? null;
    if (!contato) {
      const [first, ...rest] = nome.split(/\s+/);
      const { data: novo } = await ctx.admin.from("contacts").insert({
        org_id: ctx.orgId, first_name: first, last_name: rest.join(" ") || null, email: texto(d.contact_email)?.toLowerCase() ?? null,
        whatsapp_phone: digitos(texto(d.contact_phone)) || null, source: "importação",
      }).select("id, custom_fields").single();
      contato = novo;
    }
  }
  const empresa = await empresaPorNome(ctx, texto(d.company), true, texto(d.company_external_id));
  const dono = await usuarioPorEmail(ctx, texto(d.owner_email));
  const etapa = await etapaDaLinha(ctx, texto(d.stage), texto(d.pipeline));
  const status = texto(d.status)?.toLowerCase();
  const statusFinal = status && STATUS_NEGOCIO.has(status) ? status : /won|ganh/.test(status ?? "") ? "won" : /lost|perd/.test(status ?? "") ? "lost" : "open";
  const extras = await camposExtras(ctx, "deal", d);
  let lossReasonId: string | null = null;
  if (statusFinal === "lost" && texto(d.loss_reason)) {
    const { data: lr } = await ctx.admin.from("loss_reasons").select("id").eq("org_id", ctx.orgId).ilike("label", texto(d.loss_reason)!).limit(1).maybeSingle();
    lossReasonId = lr?.id ?? null;
  }
  const campos = {
    ...(titulo ? { title: titulo } : {}),
    value: numero(texto(d.value)) ?? 0,
    currency: texto(d.currency) ?? "BRL",
    status: statusFinal,
    probability: statusFinal === "won" ? 100 : statusFinal === "lost" ? 0 : (etapa?.win_probability ?? 0),
    ...(etapa ? { stage_id: etapa.id } : {}),
    ...(contato ? { contact_id: contato.id } : {}),
    ...(empresa ? { company_id: empresa.id } : {}),
    ...(dono ? { owner_id: dono } : {}),
    ...(data(texto(d.close_date)) ? { close_date: data(texto(d.close_date))!.slice(0, 10) } : {}),
    ...(lossReasonId ? { loss_reason_id: lossReasonId } : {}),
  };

  let existente: { id: string; custom_fields: unknown } | null = null;
  if (externo) {
    const { data } = await ctx.admin.from("deals").select("id, custom_fields").eq("org_id", ctx.orgId).eq("custom_fields->>external_id", externo).limit(1).maybeSingle();
    existente = data;
  }
  const custom = { ...((existente?.custom_fields as Record<string, unknown>) ?? {}), ...extras, ...(externo ? { external_id: externo } : {}) };
  if (existente) {
    const { error } = await ctx.admin.from("deals").update({ ...campos, custom_fields: custom, updated_at: new Date().toISOString() }).eq("id", existente.id);
    if (error) return { row_number: 0, status: "error", error: error.message };
    return { row_number: 0, status: "updated", entity_type: "deal", entity_id: existente.id };
  }
  const criado = data(texto(d.created_at));
  const { data: novo, error } = await ctx.admin.from("deals").insert({
    org_id: ctx.orgId, title: titulo ?? `Negócio ${externo}`, ...campos, custom_fields: custom, ...(criado ? { created_at: criado } : {}),
  }).select("id").single();
  if (error || !novo) return { row_number: 0, status: "error", error: error?.message ?? "falha ao criar" };
  return { row_number: 0, status: "created", entity_type: "deal", entity_id: novo.id };
}

async function importarAtividade(ctx: Ctx, d: Dados): Promise<Resultado> {
  const titulo = texto(d.title);
  if (!titulo) return { row_number: 0, status: "error", error: "Linha sem título." };
  const tipoBruto = texto(d.type)?.toLowerCase() ?? "task";
  const tipo = TIPOS_ATIVIDADE.has(tipoBruto) ? tipoBruto
    : /liga|call|telef/.test(tipoBruto) ? "call" : /reun|meet|visita/.test(tipoBruto) ? "meeting" : /nota|note|coment/.test(tipoBruto) ? "note" : /mail/.test(tipoBruto) ? "email" : "task";
  const contato = await contatoPorReferencia(ctx, d);
  let dealId: string | null = null;
  if (texto(d.deal_external_id)) {
    const { data } = await ctx.admin.from("deals").select("id").eq("org_id", ctx.orgId).eq("custom_fields->>external_id", texto(d.deal_external_id)!).limit(1).maybeSingle();
    dealId = data?.id ?? null;
  }
  if (!dealId && texto(d.deal_title)) {
    const { data } = await ctx.admin.from("deals").select("id").eq("org_id", ctx.orgId).ilike("title", texto(d.deal_title)!).limit(1).maybeSingle();
    dealId = data?.id ?? null;
  }
  if (!dealId && contato) {
    const { data } = await ctx.admin.from("deals").select("id").eq("org_id", ctx.orgId).eq("contact_id", contato.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    dealId = data?.id ?? null;
  }
  const dono = await usuarioPorEmail(ctx, texto(d.owner_email));
  const concluida = texto(d.completed) ? ["sim", "s", "yes", "y", "true", "1", "done", "concluida", "concluída", "x"].includes(texto(d.completed)!.toLowerCase()) : false;
  const { data: nova, error } = await ctx.admin.from("activities").insert({
    org_id: ctx.orgId, type: tipo, title: titulo, body: texto(d.body), due_date: data(texto(d.due_date)),
    completed_at: concluida ? new Date().toISOString() : null, contact_id: contato?.id ?? null, deal_id: dealId, user_id: dono,
  }).select("id").single();
  if (error || !nova) return { row_number: 0, status: "error", error: error?.message ?? "falha ao criar" };
  return { row_number: 0, status: "created", entity_type: "activity", entity_id: nova.id };
}


export function novoCtx(admin: SupabaseClient, orgId: string, importId: string, kind: string, mapaEtapas: Record<string, string>): Ctx {
  return { admin, orgId, importId, kind, mapaEtapas, cacheUsuarios: new Map(), cacheEmpresas: new Map(), cacheEtapas: null, emAndamento: new Map() };
}

/** Processa um lote e grava import_rows. Devolve a contagem e os resultados. */
export async function importarLote(ctx: Ctx, linhas: { row_number: number; data: Dados }[]) {
  // Estresse de volume (25/09/2026): em série, 200 linhas levavam mais que o limite
  // de 150 s da function. Contatos e empresas vão em paralelo controlado (a mesma
  // empresa ou tag é resolvida uma vez só, e o índice único de e-mail e WhatsApp
  // segura contato repetido). Negócios e atividades seguem em série porque podem
  // criar o contato pelo nome, sem chave única que segure a corrida.
  const processar = async (linha: { row_number: number; data: Dados }): Promise<Resultado> => {
    const d = (linha.data ?? {}) as Dados;
    let r: Resultado;
    try {
      r = ctx.kind === "contacts" ? await importarContato(ctx, d)
        : ctx.kind === "companies" ? await importarEmpresa(ctx, d)
        : ctx.kind === "deals" ? await importarNegocio(ctx, d)
        : await importarAtividade(ctx, d);
    } catch (e) {
      r = { row_number: 0, status: "error", error: e instanceof Error ? e.message : String(e) };
    }
    r.row_number = Number(linha.row_number) || 0;
    return r;
  };
  const paralelo = ctx.kind === "contacts" || ctx.kind === "companies" ? PARALELO : 1;
  const resultados: Resultado[] = new Array(linhas.length);
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < linhas.length) {
      const i = proxima++;
      resultados[i] = await processar(linhas[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelo, linhas.length) }, trabalhador));
  if (resultados.length) {
    await ctx.admin.from("import_rows").insert(resultados.map((r) => ({
      import_id: ctx.importId, org_id: ctx.orgId, row_number: r.row_number,
      raw: linhas.find((l) => Number(l.row_number) === r.row_number)?.data ?? {},
      status: r.status, entity_type: r.entity_type ?? null, entity_id: r.entity_id ?? null, error: r.error ?? null,
    })));
  }
  const contagem = { created: 0, updated: 0, skipped: 0, error: 0 };
  for (const r of resultados) contagem[r.status]++;
  return { ...contagem, results: resultados };
}
