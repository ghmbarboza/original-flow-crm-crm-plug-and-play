// Rotas da API pública. Cada handler recebe o admin (service role), a chave já
// autenticada e os dados; o roteador confere o escopo antes de chamar.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { moverNegocio } from "../_shared/negocio.ts";
import { entregarTexto } from "../_shared/entrega.ts";

export class ErroApi extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroApi";
  }
}

export interface Chave {
  id: string;
  orgId: string;
  nome: string;
  escopos: string[];
}

type Dados = Record<string, unknown>;
interface Resposta {
  status: number;
  body: unknown;
}

const UUID = /^[0-9a-f-]{36}$/i;
const LIMITE_LISTA = 100;

function texto(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function numero(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function exigirEscopo(chave: Chave, escopo: string) {
  if (!chave.escopos.includes(escopo)) throw new ErroApi(403, `A chave não tem o escopo ${escopo}.`);
}

function limite(params: URLSearchParams): number {
  return Math.min(LIMITE_LISTA, Math.max(1, Number(params.get("limit") ?? 50) || 50));
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

async function etapaPorIdOuNome(admin: SupabaseClient, orgId: string, valor: string | null, pipelineId: string | null) {
  if (!valor) return null;
  let q = admin.from("pipeline_stages").select("id, name, pipeline_id, win_probability").eq("org_id", orgId);
  q = UUID.test(valor) ? q.eq("id", valor) : q.ilike("name", valor);
  if (pipelineId) q = q.eq("pipeline_id", pipelineId);
  const { data } = await q.order("order", { ascending: true }).limit(1).maybeSingle();
  if (!data) throw new ErroApi(422, `Etapa não encontrada: ${valor}`);
  return data;
}

async function usuarioPorEmail(admin: SupabaseClient, orgId: string, email: string | null) {
  if (!email) return null;
  const { data } = await admin.from("profiles").select("id").eq("org_id", orgId).ilike("email", email).eq("is_active", true).maybeSingle();
  if (!data) throw new ErroApi(422, `Nenhum usuário ativo com o e-mail ${email}.`);
  return data.id as string;
}

async function contatoPorReferencia(admin: SupabaseClient, orgId: string, d: Dados) {
  const id = texto(d.contact_id ?? d.id);
  const email = texto(d.email)?.toLowerCase() ?? null;
  const phone = (texto(d.phone ?? d.whatsapp) ?? "").replace(/\D/g, "");
  let q = admin.from("contacts").select("id, first_name, last_name, email, phone, whatsapp_phone").eq("org_id", orgId).is("merged_into_id", null);
  if (id && UUID.test(id)) q = q.eq("id", id);
  else if (email) q = q.ilike("email", email);
  else if (phone.length >= 10) q = q.or(`whatsapp_phone.like.%${phone.slice(-10)},phone.like.%${phone.slice(-10)}`);
  else return null;
  const { data } = await q.limit(1).maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

async function listarPipelines(admin: SupabaseClient, chave: Chave): Promise<Resposta> {
  const [{ data: pipelines }, { data: stages }] = await Promise.all([
    admin.from("pipelines").select("id, name, is_default").eq("org_id", chave.orgId).order("is_default", { ascending: false }),
    admin.from("pipeline_stages").select("id, name, order, pipeline_id, win_probability, color").eq("org_id", chave.orgId).order("order"),
  ]);
  return {
    status: 200,
    body: {
      pipelines: (pipelines ?? []).map((p) => ({ ...p, stages: (stages ?? []).filter((s) => s.pipeline_id === p.id) })),
    },
  };
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------

const CAMPOS_CONTATO = "id, first_name, last_name, email, phone, whatsapp_phone, title, status, source, lead_score, company_id, owner_id, custom_fields, created_at, updated_at";

async function listarContatos(admin: SupabaseClient, chave: Chave, params: URLSearchParams): Promise<Resposta> {
  const email = texto(params.get("email"));
  const phone = (texto(params.get("phone")) ?? "").replace(/\D/g, "");
  const q = texto(params.get("q"));
  let query = admin.from("contacts").select(CAMPOS_CONTATO).eq("org_id", chave.orgId).is("merged_into_id", null);
  if (email) query = query.ilike("email", email);
  if (phone.length >= 8) query = query.or(`whatsapp_phone.like.%${phone.slice(-10)},phone.like.%${phone.slice(-10)}`);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limite(params));
  if (error) throw new ErroApi(500, error.message);
  return { status: 200, body: { contacts: data ?? [] } };
}

async function verContato(admin: SupabaseClient, chave: Chave, id: string): Promise<Resposta> {
  const { data: contato } = await admin.from("contacts").select(CAMPOS_CONTATO).eq("org_id", chave.orgId).eq("id", id).maybeSingle();
  if (!contato) throw new ErroApi(404, "Contato não encontrado.");
  const [{ data: tags }, { data: deals }, { data: atividades }, { data: empresa }] = await Promise.all([
    admin.from("contact_tags").select("tag:tags(id, name)").eq("contact_id", id),
    admin.from("deals").select("id, title, value, currency, status, stage_id, owner_id, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("activities").select("id, type, title, body, due_date, completed_at, created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(20),
    contato.company_id ? admin.from("companies").select("id, name, domain").eq("id", contato.company_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    status: 200,
    body: {
      contact: contato,
      company: empresa ?? null,
      tags: (tags ?? []).map((t) => (t as { tag: unknown }).tag),
      deals: deals ?? [],
      activities: atividades ?? [],
    },
  };
}

async function criarOuAtualizarContato(admin: SupabaseClient, chave: Chave, d: Dados): Promise<Resposta> {
  const email = texto(d.email)?.toLowerCase() ?? null;
  const phone = texto(d.phone) ?? null;
  const whatsapp = (texto(d.whatsapp ?? d.whatsapp_phone ?? d.phone) ?? "").replace(/\D/g, "") || null;
  if (!email && !whatsapp) throw new ErroApi(422, "Informe email ou phone.");

  const nome = texto(d.name ?? d.full_name);
  const first = texto(d.first_name) ?? (nome ? nome.split(/\s+/)[0] : null);
  const last = texto(d.last_name) ?? (nome ? nome.split(/\s+/).slice(1).join(" ") || null : null);

  let companyId: string | null = texto(d.company_id);
  const empresaNome = texto(d.company ?? d.company_name);
  if (!companyId && empresaNome) {
    const { data: existente } = await admin.from("companies").select("id").eq("org_id", chave.orgId).ilike("name", empresaNome).limit(1).maybeSingle();
    if (existente) companyId = existente.id;
    else {
      const { data: nova } = await admin.from("companies").insert({ org_id: chave.orgId, name: empresaNome }).select("id").single();
      companyId = nova?.id ?? null;
    }
  }
  const ownerId = await usuarioPorEmail(admin, chave.orgId, texto(d.owner_email));

  const existente = await contatoPorReferencia(admin, chave.orgId, { email, phone: whatsapp });
  const campos: Dados = {
    ...(first ? { first_name: first } : {}),
    ...(last !== null ? { last_name: last } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(whatsapp ? { whatsapp_phone: whatsapp } : {}),
    ...(texto(d.title) ? { title: texto(d.title) } : {}),
    ...(texto(d.status) ? { status: texto(d.status) } : {}),
    ...(texto(d.source) ? { source: texto(d.source) } : {}),
    ...(companyId ? { company_id: companyId } : {}),
    ...(ownerId ? { owner_id: ownerId } : {}),
    ...(d.custom_fields && typeof d.custom_fields === "object" ? { custom_fields: d.custom_fields } : {}),
  };

  if (existente) {
    const { data: atual } = await admin.from("contacts").select("custom_fields").eq("id", existente.id).maybeSingle();
    if (campos.custom_fields) campos.custom_fields = { ...((atual?.custom_fields as Dados) ?? {}), ...(campos.custom_fields as Dados) };
    const { error } = await admin.from("contacts").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", existente.id);
    if (error) throw new ErroApi(500, error.message);
    return { status: 200, body: { contact_id: existente.id, created: false } };
  }
  const { data: criado, error } = await admin.from("contacts").insert({
    org_id: chave.orgId, first_name: first ?? email ?? whatsapp ?? "Contato", ...campos,
    source: texto(d.source) ?? `api: ${chave.nome}`,
  }).select("id").single();
  if (error) throw new ErroApi(500, error.message);
  return { status: 201, body: { contact_id: criado.id, created: true } };
}

// ---------------------------------------------------------------------------
// Negócios
// ---------------------------------------------------------------------------

const CAMPOS_NEGOCIO = "id, title, value, currency, status, probability, stage_id, contact_id, company_id, owner_id, close_date, custom_fields, created_at, updated_at";

async function listarNegocios(admin: SupabaseClient, chave: Chave, params: URLSearchParams): Promise<Resposta> {
  let q = admin.from("deals").select(CAMPOS_NEGOCIO).eq("org_id", chave.orgId);
  const contactId = texto(params.get("contact_id"));
  const status = texto(params.get("status"));
  const stageId = texto(params.get("stage_id"));
  if (contactId) q = q.eq("contact_id", contactId);
  if (status) q = q.eq("status", status);
  if (stageId) q = q.eq("stage_id", stageId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limite(params));
  if (error) throw new ErroApi(500, error.message);
  return { status: 200, body: { deals: data ?? [] } };
}

async function verNegocio(admin: SupabaseClient, chave: Chave, id: string): Promise<Resposta> {
  const { data: deal } = await admin.from("deals").select(CAMPOS_NEGOCIO).eq("org_id", chave.orgId).eq("id", id).maybeSingle();
  if (!deal) throw new ErroApi(404, "Negócio não encontrado.");
  const [{ data: stage }, { data: produtos }, { data: historico }] = await Promise.all([
    deal.stage_id ? admin.from("pipeline_stages").select("id, name, pipeline_id").eq("id", deal.stage_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("deal_products").select("product_id, quantity, unit_price, total_price").eq("deal_id", id),
    admin.from("activities").select("id, type, title, body, created_at").eq("deal_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  return { status: 200, body: { deal, stage: stage ?? null, products: produtos ?? [], activities: historico ?? [] } };
}

async function criarNegocio(admin: SupabaseClient, chave: Chave, d: Dados): Promise<Resposta> {
  let contatoId = texto(d.contact_id);
  if (!contatoId) {
    const c = await contatoPorReferencia(admin, chave.orgId, d);
    if (!c) throw new ErroApi(422, "Informe contact_id ou email/phone de um contato existente.");
    contatoId = c.id as string;
  }
  const pipelineId = texto(d.pipeline_id);
  const etapa = await etapaPorIdOuNome(admin, chave.orgId, texto(d.stage ?? d.stage_id), pipelineId);
  let stageId = etapa?.id ?? null;
  if (!stageId) {
    let q = admin.from("pipeline_stages").select("id, win_probability").eq("org_id", chave.orgId).order("order", { ascending: true });
    if (pipelineId) q = q.eq("pipeline_id", pipelineId);
    const { data } = await q.limit(1).maybeSingle();
    stageId = data?.id ?? null;
  }
  const ownerId = await usuarioPorEmail(admin, chave.orgId, texto(d.owner_email));
  let companyId = texto(d.company_id);
  const { data: org } = await admin.from("organizations").select("business_model").eq("id", chave.orgId).maybeSingle();
  if (!companyId) {
    const { data: ct } = await admin.from("contacts").select("company_id").eq("id", contatoId).maybeSingle();
    companyId = (ct?.company_id as string | null) ?? null;
  }
  if (org?.business_model === "b2b" && !companyId) {
    throw new ErroApi(422, "Esta organização vende B2B: informe company_id ou um contato com empresa.");
  }
  const { data: deal, error } = await admin.from("deals").insert({
    org_id: chave.orgId,
    contact_id: contatoId,
    company_id: companyId,
    title: texto(d.title) ?? "Negócio",
    value: numero(d.value) ?? 0,
    currency: texto(d.currency) ?? "BRL",
    stage_id: stageId,
    probability: etapa?.win_probability ?? 0,
    owner_id: ownerId,
    close_date: texto(d.close_date),
    custom_fields: d.custom_fields && typeof d.custom_fields === "object" ? d.custom_fields : {},
    status: "open",
  }).select("id").single();
  if (error) throw new ErroApi(500, error.message);

  const produtos = Array.isArray(d.products) ? (d.products as Dados[]) : [];
  for (const p of produtos) {
    const productId = texto(p.product_id);
    if (!productId) continue;
    const { data: prod } = await admin.from("products").select("price").eq("org_id", chave.orgId).eq("id", productId).maybeSingle();
    if (!prod) continue;
    const quantidade = numero(p.quantity) ?? 1;
    const unitario = numero(p.unit_price) ?? Number(prod.price ?? 0);
    await admin.from("deal_products").insert({ deal_id: deal.id, product_id: productId, quantity: quantidade, unit_price: unitario });
  }
  return { status: 201, body: { deal_id: deal.id, stage_id: stageId } };
}

async function atualizarNegocio(admin: SupabaseClient, chave: Chave, id: string, d: Dados): Promise<Resposta> {
  const { data: deal } = await admin.from("deals").select("id, stage_id, status").eq("org_id", chave.orgId).eq("id", id).maybeSingle();
  if (!deal) throw new ErroApi(404, "Negócio não encontrado.");

  const mudancas: Dados = { updated_at: new Date().toISOString() };
  const titulo = texto(d.title);
  if (titulo) mudancas.title = titulo;
  const valor = numero(d.value);
  if (valor !== null) mudancas.value = valor;
  const closeDate = texto(d.close_date);
  if (closeDate) mudancas.close_date = closeDate;
  const companyId = texto(d.company_id);
  if (companyId) mudancas.company_id = companyId;
  const ownerId = await usuarioPorEmail(admin, chave.orgId, texto(d.owner_email));
  if (ownerId) mudancas.owner_id = ownerId;
  if (d.custom_fields && typeof d.custom_fields === "object") {
    const { data: atual } = await admin.from("deals").select("custom_fields").eq("id", id).maybeSingle();
    mudancas.custom_fields = { ...((atual?.custom_fields as Dados) ?? {}), ...(d.custom_fields as Dados) };
  }
  const status = texto(d.status);
  if (status) {
    if (!["open", "won", "lost"].includes(status)) throw new ErroApi(422, 'status deve ser "open", "won" ou "lost".');
    mudancas.status = status;
    if (status === "won") mudancas.probability = 100;
    if (status === "lost") mudancas.probability = 0;
    const motivo = texto(d.loss_reason);
    if (status === "lost" && motivo) {
      const { data: lr } = await admin.from("loss_reasons").select("id").eq("org_id", chave.orgId).ilike("label", motivo).limit(1).maybeSingle();
      if (lr) mudancas.loss_reason_id = lr.id;
    }
  }

  const { error } = await admin.from("deals").update(mudancas).eq("id", id);
  if (error) throw new ErroApi(500, error.message);

  // Etapa por último, pela RPC, para o histórico registrar quem moveu.
  const etapa = await etapaPorIdOuNome(admin, chave.orgId, texto(d.stage ?? d.stage_id), texto(d.pipeline_id));
  let moved = false;
  if (etapa && etapa.id !== deal.stage_id) {
    moved = await moverNegocio(admin, id, etapa.id, "automacao", `Integração "${chave.nome}"${texto(d.reason) ? `: ${texto(d.reason)}` : ""}`);
    if (!moved) throw new ErroApi(409, "Não foi possível mover: o negócio não está aberto.");
  }
  return { status: 200, body: { deal_id: id, moved } };
}

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------

const CAMPOS_CONVERSA = "id, contact_id, deal_id, phone_number, channel, provider, status, assigned_to, last_message_at, last_message_preview, unread_count, created_at";

async function listarConversas(admin: SupabaseClient, chave: Chave, params: URLSearchParams): Promise<Resposta> {
  let q = admin.from("conversations").select(CAMPOS_CONVERSA).eq("org_id", chave.orgId).eq("is_demo", false);
  const phone = (texto(params.get("phone")) ?? "").replace(/\D/g, "");
  const contactId = texto(params.get("contact_id"));
  const status = texto(params.get("status"));
  if (phone) q = q.like("phone_number", `%${phone.slice(-10)}`);
  if (contactId) q = q.eq("contact_id", contactId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("last_message_at", { ascending: false, nullsFirst: false }).limit(limite(params));
  if (error) throw new ErroApi(500, error.message);
  return { status: 200, body: { conversations: data ?? [] } };
}

async function conversaDaOrg(admin: SupabaseClient, chave: Chave, id: string) {
  const { data } = await admin.from("conversations")
    .select("id, org_id, contact_id, deal_id, phone_number, channel, provider, provider_conversation_id, status, is_demo")
    .eq("org_id", chave.orgId).eq("id", id).maybeSingle();
  if (!data) throw new ErroApi(404, "Conversa não encontrada.");
  return data;
}

async function listarMensagens(admin: SupabaseClient, chave: Chave, id: string, params: URLSearchParams): Promise<Resposta> {
  await conversaDaOrg(admin, chave, id);
  const { data, error } = await admin.from("conversation_messages")
    .select("id, direction, type, content, media_url, is_from_ai, is_internal_note, status, sent_at")
    .eq("conversation_id", id).order("sent_at", { ascending: false }).limit(limite(params));
  if (error) throw new ErroApi(500, error.message);
  return { status: 200, body: { messages: (data ?? []).reverse() } };
}

async function registrarMensagem(admin: SupabaseClient, chave: Chave, id: string, d: Dados): Promise<Resposta> {
  const conv = await conversaDaOrg(admin, chave, id);
  const conteudo = texto(d.content ?? d.text);
  if (!conteudo) throw new ErroApi(422, "Informe content.");
  const direction = texto(d.direction) === "inbound" ? "inbound" : "outbound";
  const { data, error } = await admin.from("conversation_messages").insert({
    conversation_id: conv.id, org_id: chave.orgId, direction, content: conteudo, type: "text",
    is_from_ai: false, is_internal_note: d.internal_note === true, status: "sent",
  }).select("id").single();
  if (error) throw new ErroApi(500, error.message);
  await admin.from("conversations").update({
    last_message_at: new Date().toISOString(), last_message_preview: conteudo.slice(0, 120), updated_at: new Date().toISOString(),
  }).eq("id", conv.id);
  return { status: 201, body: { message_id: data.id, sent: false } };
}

async function enviarMensagem(admin: SupabaseClient, chave: Chave, id: string, d: Dados): Promise<Resposta> {
  const conv = await conversaDaOrg(admin, chave, id);
  const conteudo = texto(d.content ?? d.text);
  if (!conteudo) throw new ErroApi(422, "Informe content.");
  const entrega = await entregarTexto(admin, conv as Parameters<typeof entregarTexto>[1], conteudo);
  const { data } = await admin.from("conversation_messages").insert({
    conversation_id: conv.id, org_id: chave.orgId, direction: "outbound", content: conteudo, type: "text",
    is_from_ai: false, provider_message_id: entrega.providerMessageId, status: entrega.ok ? "sent" : "failed",
  }).select("id").single();
  await admin.from("conversations").update({
    last_message_at: new Date().toISOString(), last_message_preview: conteudo.slice(0, 120), updated_at: new Date().toISOString(),
  }).eq("id", conv.id);
  if (!entrega.ok) throw new ErroApi(502, entrega.motivo ?? "O canal não aceitou o envio.");
  return { status: 201, body: { message_id: data?.id ?? null, sent: true } };
}

async function mudarStatusConversa(admin: SupabaseClient, chave: Chave, id: string, status: "human_takeover" | "ai_active", d: Dados): Promise<Resposta> {
  const conv = await conversaDaOrg(admin, chave, id);
  const mudancas: Dados = { status, updated_at: new Date().toISOString() };
  const assignTo = await usuarioPorEmail(admin, chave.orgId, texto(d.assign_to_email));
  if (assignTo) mudancas.assigned_to = assignTo;
  const { error } = await admin.from("conversations").update(mudancas).eq("id", conv.id);
  if (error) throw new ErroApi(500, error.message);
  const motivo = texto(d.reason);
  if (motivo) {
    await admin.from("conversation_messages").insert({
      conversation_id: conv.id, org_id: chave.orgId, direction: "outbound", content: `[${chave.nome}] ${motivo}`, type: "text",
      is_from_ai: false, is_internal_note: true, status: "sent",
    });
  }
  return { status: 200, body: { conversation_id: conv.id, status } };
}

// ---------------------------------------------------------------------------
// Atividades, produtos e conhecimento
// ---------------------------------------------------------------------------

const TIPOS_ATIVIDADE = new Set(["call", "email", "meeting", "note", "task"]);

async function criarAtividade(admin: SupabaseClient, chave: Chave, d: Dados): Promise<Resposta> {
  const tipo = texto(d.type) ?? "task";
  if (!TIPOS_ATIVIDADE.has(tipo)) throw new ErroApi(422, `type deve ser um de: ${[...TIPOS_ATIVIDADE].join(", ")}.`);
  const titulo = texto(d.title);
  if (!titulo) throw new ErroApi(422, "Informe title.");
  let contactId = texto(d.contact_id);
  const dealId = texto(d.deal_id);
  if (!contactId && dealId) {
    const { data } = await admin.from("deals").select("contact_id").eq("org_id", chave.orgId).eq("id", dealId).maybeSingle();
    contactId = (data?.contact_id as string | null) ?? null;
  }
  const userId = await usuarioPorEmail(admin, chave.orgId, texto(d.owner_email));
  const { data, error } = await admin.from("activities").insert({
    org_id: chave.orgId, type: tipo, title: titulo, body: texto(d.body), due_date: texto(d.due_date),
    contact_id: contactId, deal_id: dealId, user_id: userId,
  }).select("id").single();
  if (error) throw new ErroApi(500, error.message);
  return { status: 201, body: { activity_id: data.id } };
}

async function listarProdutos(admin: SupabaseClient, chave: Chave, params: URLSearchParams): Promise<Resposta> {
  let q = admin.from("products").select("id, name, description, price, currency, is_active, track_stock, stock_quantity, custom_fields").eq("org_id", chave.orgId).eq("is_active", true);
  const busca = texto(params.get("q"));
  if (busca) q = q.or(`name.ilike.%${busca}%,description.ilike.%${busca}%`);
  const { data, error } = await q.order("name").limit(limite(params));
  if (error) throw new ErroApi(500, error.message);
  return { status: 200, body: { products: data ?? [] } };
}

async function conhecimento(admin: SupabaseClient, chave: Chave): Promise<Resposta> {
  const [{ data: faqs }, { data: objections }, { data: config }] = await Promise.all([
    admin.from("ai_knowledge_faqs").select("question, answer").eq("org_id", chave.orgId).order("order"),
    admin.from("ai_knowledge_objections").select("objection, response").eq("org_id", chave.orgId).order("order"),
    admin.from("ai_messaging_config").select("agent_name, agent_tone, agent_objective").eq("org_id", chave.orgId).maybeSingle(),
  ]);
  return { status: 200, body: { agent: config ?? null, faqs: faqs ?? [], objections: objections ?? [] } };
}

// ---------------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------------

export async function executarRota(
  admin: SupabaseClient, chave: Chave, metodo: string, caminho: string, params: URLSearchParams, corpo: Dados,
): Promise<Resposta> {
  const partes = caminho.split("/").filter(Boolean);
  const [recurso, id, sub] = partes;

  if (recurso === "pipelines" && metodo === "GET") { exigirEscopo(chave, "pipelines:read"); return listarPipelines(admin, chave); }

  if (recurso === "contacts") {
    if (metodo === "GET" && !id) { exigirEscopo(chave, "contacts:read"); return listarContatos(admin, chave, params); }
    if (metodo === "GET" && id) { exigirEscopo(chave, "contacts:read"); return verContato(admin, chave, id); }
    if (metodo === "POST" && !id) { exigirEscopo(chave, "contacts:write"); return criarOuAtualizarContato(admin, chave, corpo); }
  }

  if (recurso === "deals") {
    if (metodo === "GET" && !id) { exigirEscopo(chave, "deals:read"); return listarNegocios(admin, chave, params); }
    if (metodo === "GET" && id) { exigirEscopo(chave, "deals:read"); return verNegocio(admin, chave, id); }
    if (metodo === "POST" && !id) { exigirEscopo(chave, "deals:write"); return criarNegocio(admin, chave, corpo); }
    if (metodo === "PATCH" && id) { exigirEscopo(chave, "deals:write"); return atualizarNegocio(admin, chave, id, corpo); }
  }

  if (recurso === "conversations") {
    if (metodo === "GET" && !id) { exigirEscopo(chave, "conversations:read"); return listarConversas(admin, chave, params); }
    if (metodo === "GET" && id && sub === "messages") { exigirEscopo(chave, "conversations:read"); return listarMensagens(admin, chave, id, params); }
    if (metodo === "POST" && id && sub === "messages") { exigirEscopo(chave, "conversations:write"); return registrarMensagem(admin, chave, id, corpo); }
    if (metodo === "POST" && id && sub === "send") { exigirEscopo(chave, "conversations:write"); return enviarMensagem(admin, chave, id, corpo); }
    if (metodo === "POST" && id && (sub === "handoff" || sub === "pause-ai")) { exigirEscopo(chave, "conversations:write"); return mudarStatusConversa(admin, chave, id, "human_takeover", corpo); }
    if (metodo === "POST" && id && sub === "resume-ai") { exigirEscopo(chave, "conversations:write"); return mudarStatusConversa(admin, chave, id, "ai_active", corpo); }
  }

  if (recurso === "activities" && metodo === "POST") { exigirEscopo(chave, "activities:write"); return criarAtividade(admin, chave, corpo); }
  if (recurso === "products" && metodo === "GET") { exigirEscopo(chave, "products:read"); return listarProdutos(admin, chave, params); }
  if (recurso === "knowledge" && metodo === "GET") { exigirEscopo(chave, "knowledge:read"); return conhecimento(admin, chave); }

  throw new ErroApi(404, `Rota desconhecida: ${metodo} ${caminho}. Veja /api/openapi.json.`);
}
