// Importação universal (Sprint 12 B8): grava um lote de linhas já mapeadas.
//
// O front lê o CSV, aplica o de/para e manda lotes de até 500 registros
// {row_number, data}. Aqui, com service role e a org do usuário logado:
//  - contatos: atualiza se achar external_id, e-mail ou telefone; senão cria
//  - empresas: atualiza por external_id, domínio ou nome; senão cria
//  - negócios: atualiza por external_id; senão cria (contato por e-mail/telefone/nome,
//    empresa por nome, etapa pelo de/para de nomes ou sugestão, dono por e-mail)
//  - atividades: cria (contato/negócio por referência)
// Cada linha vira import_rows com o resultado; desfazer apaga o que foi criado.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LOTE_MAX = 500;
const STATUS_CONTATO = new Set(["lead", "prospect", "customer", "churned"]);
const STATUS_NEGOCIO = new Set(["open", "won", "lost"]);
const TIPOS_ATIVIDADE = new Set(["call", "email", "meeting", "note", "task"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Dados = Record<string, string>;
type Resultado = { row_number: number; status: "created" | "updated" | "skipped" | "error"; entity_type?: string; entity_id?: string; error?: string };

interface Ctx {
  admin: SupabaseClient;
  orgId: string;
  importId: string;
  kind: string;
  mapaEtapas: Record<string, string>;
  cacheUsuarios: Map<string, string | null>;
  cacheEmpresas: Map<string, string>;
  cacheEtapas: { id: string; name: string; pipeline_id: string; win_probability: number }[] | null;
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

async function empresaPorNome(ctx: Ctx, nome: string | null, criar: boolean): Promise<{ id: string; criada: boolean } | null> {
  if (!nome) return null;
  const chave = normalizar(nome);
  if (ctx.cacheEmpresas.has(chave)) return { id: ctx.cacheEmpresas.get(chave)!, criada: false };
  const { data } = await ctx.admin.from("companies").select("id").eq("org_id", ctx.orgId).ilike("name", nome).limit(1).maybeSingle();
  if (data) { ctx.cacheEmpresas.set(chave, data.id); return { id: data.id, criada: false }; }
  if (!criar) return null;
  const { data: nova, error } = await ctx.admin.from("companies").insert({ org_id: ctx.orgId, name: nome }).select("id").single();
  if (error || !nova) return null;
  ctx.cacheEmpresas.set(chave, nova.id);
  return { id: nova.id, criada: true };
}

async function contatoPorReferencia(ctx: Ctx, d: Dados) {
  const externo = texto(d.external_id);
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

  const status = texto(d.status)?.toLowerCase();
  const empresa = await empresaPorNome(ctx, texto(d.company), true);
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
  if (error || !novo) return { row_number: 0, status: "error", error: error?.message ?? "falha ao criar" };
  await aplicarTags(ctx, novo.id, texto(d.tags));
  return { row_number: 0, status: "created", entity_type: "contact", entity_id: novo.id };
}

async function aplicarTags(ctx: Ctx, contactId: string, tags: string | null) {
  if (!tags) return;
  for (const nome of tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10)) {
    const { data: existente } = await ctx.admin.from("tags").select("id").eq("org_id", ctx.orgId).ilike("name", nome).maybeSingle();
    let tagId = existente?.id as string | undefined;
    if (!tagId) {
      const { data: nova } = await ctx.admin.from("tags").insert({ org_id: ctx.orgId, name: nome }).select("id").single();
      tagId = nova?.id;
    }
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
    const { data } = await ctx.admin.from("contacts").select("id, custom_fields").eq("org_id", ctx.orgId).is("merged_into_id", null)
      .or(`first_name.ilike.${nome.split(/\s+/)[0]}%`).limit(20);
    contato = (data ?? []).find((c) => c) ?? null;
    if (!contato) {
      const [first, ...rest] = nome.split(/\s+/);
      const { data: novo } = await ctx.admin.from("contacts").insert({
        org_id: ctx.orgId, first_name: first, last_name: rest.join(" ") || null, email: texto(d.contact_email)?.toLowerCase() ?? null,
        whatsapp_phone: digitos(texto(d.contact_phone)) || null, source: "importação",
      }).select("id, custom_fields").single();
      contato = novo;
    }
  }
  const empresa = await empresaPorNome(ctx, texto(d.company), true);
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

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader ? await admin.auth.getUser(authHeader.replace("Bearer ", "")) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: perfil } = await admin.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = perfil?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const body = await req.json().catch(() => ({}));
    const importId = texto(body.import_id);
    const linhas = Array.isArray(body.rows) ? (body.rows as { row_number: number; data: Dados }[]).slice(0, LOTE_MAX) : [];
    if (!importId) return json({ error: "Informe import_id." }, 400);
    const { data: imp } = await admin.from("imports").select("id, kind, mapping, status").eq("id", importId).eq("org_id", orgId).maybeSingle();
    if (!imp) return json({ error: "Importação não encontrada." }, 404);
    if (imp.status === "undone" || imp.status === "completed") return json({ error: "Esta importação já foi encerrada." }, 409);
    await admin.from("imports").update({ status: "processing" }).eq("id", importId);

    const mapping = (imp.mapping ?? {}) as { stages?: Record<string, string> };
    const ctx: Ctx = { admin, orgId, importId, kind: imp.kind, mapaEtapas: mapping.stages ?? {}, cacheUsuarios: new Map(), cacheEmpresas: new Map(), cacheEtapas: null };
    const resultados: Resultado[] = [];
    for (const linha of linhas) {
      const d = (linha.data ?? {}) as Dados;
      let r: Resultado;
      try {
        r = imp.kind === "contacts" ? await importarContato(ctx, d)
          : imp.kind === "companies" ? await importarEmpresa(ctx, d)
          : imp.kind === "deals" ? await importarNegocio(ctx, d)
          : await importarAtividade(ctx, d);
      } catch (e) {
        r = { row_number: 0, status: "error", error: e instanceof Error ? e.message : String(e) };
      }
      r.row_number = Number(linha.row_number) || 0;
      resultados.push(r);
    }
    if (resultados.length) {
      await admin.from("import_rows").insert(resultados.map((r) => ({
        import_id: importId, org_id: orgId, row_number: r.row_number, raw: linhas.find((l) => Number(l.row_number) === r.row_number)?.data ?? {},
        status: r.status, entity_type: r.entity_type ?? null, entity_id: r.entity_id ?? null, error: r.error ?? null,
      })));
    }
    const contagem = { created: 0, updated: 0, skipped: 0, error: 0 };
    for (const r of resultados) contagem[r.status]++;
    return json({ ok: true, ...contagem, results: resultados });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
