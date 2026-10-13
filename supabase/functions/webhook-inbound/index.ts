// Webhook de entrada genérico (Sprint 11, Fase 2). Contrato em WEBHOOKS.md.
//
// Qualquer solução do Viver de IA (ou n8n, Make, um formulário) chama esta URL com
// a chave criada em Configurações > Integrações > Webhooks:
//   Authorization: Bearer fcrm_...   (ou x-webhook-token / x-api-key / ?token=)
//
// O corpo pode vir em três formatos:
//   1. Ação do CRM:        { "action": "contact.upsert", "data": { ... } }
//   2. Evento de solução:  { "event": "contract.signed", "data": { ... } }  (envelope
//      no mesmo formato que o FlowCRM manda na saída)
//   3. Plano:              { "nome": "...", "email": "...", "telefone": "..." }
//      tratado como lead.created, para quem só sabe mandar a linha do lead.
//
// Idempotency-Key (ou o `id` do envelope) evita processar a mesma chamada duas
// vezes: a repetição devolve a resposta original com "duplicate": true.
// Toda chamada autenticada fica em webhook_inbound_logs.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  etapasDaOrganizacao, funilDoNegocio, funilPadrao, garantirNegocioAberto, primeiraEtapaDoFunil, resolverEtapaPorNome,
} from "../_shared/negocio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Dados = Record<string, unknown>;

class ErroEntrada extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(texto: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Leitura tolerante de campos: cada solução nomeia do seu jeito.
// ---------------------------------------------------------------------------

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function primeiro(obj: Dados | null | undefined, ...chaves: string[]): unknown {
  if (!obj) return undefined;
  for (const c of chaves) {
    if (obj[c] !== undefined && obj[c] !== null && obj[c] !== "") return obj[c];
  }
  return undefined;
}

/** Bloco de quem é o contato: data.contact, data.lead, data.cliente... ou o próprio data. */
function blocoPessoa(dados: Dados): Dados {
  const aninhado = primeiro(dados, "contact", "lead", "cliente", "customer", "client", "signer", "patient", "paciente", "person");
  if (aninhado && typeof aninhado === "object" && !Array.isArray(aninhado)) return aninhado as Dados;
  const assinantes = dados.signers;
  if (Array.isArray(assinantes) && assinantes[0] && typeof assinantes[0] === "object") return assinantes[0] as Dados;
  return dados;
}

/** Só dígitos; celular/fixo brasileiro sem DDI ganha o 55. */
function normalizarTelefone(v: unknown): string | null {
  const digitos = String(v ?? "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

interface Pessoa {
  email: string | null;
  telefone: string | null;
  primeiroNome: string | null;
  sobrenome: string | null;
  empresa: string | null;
  tags: string[];
  origem: string | null;
  camposExtras: Dados | null;
}

function lerPessoa(dados: Dados): Pessoa {
  const p = blocoPessoa(dados);
  const nomeCompleto = texto(primeiro(p, "name", "nome", "full_name", "fullName", "nome_completo"));
  let primeiroNome = texto(primeiro(p, "first_name", "firstName", "primeiro_nome"));
  let sobrenome = texto(primeiro(p, "last_name", "lastName", "sobrenome"));
  if (!primeiroNome && nomeCompleto) {
    const [a, ...resto] = nomeCompleto.split(/\s+/);
    primeiroNome = a;
    sobrenome = sobrenome ?? (resto.join(" ") || null);
  }
  const empresaBruta = primeiro(p, "company", "empresa", "company_name", "empresa_nome") ?? primeiro(dados, "company", "empresa");
  const empresa = empresaBruta && typeof empresaBruta === "object"
    ? texto((empresaBruta as Dados).name ?? (empresaBruta as Dados).nome)
    : texto(empresaBruta);
  const tagsBrutas = primeiro(p, "tags", "etiquetas") ?? primeiro(dados, "tags");
  return {
    email: texto(primeiro(p, "email", "e_mail", "email_cliente", "cliente_email", "mail"))?.toLowerCase() ?? null,
    telefone: normalizarTelefone(primeiro(p, "whatsapp", "phone", "telefone", "celular", "mobile", "phone_number", "phoneNumber", "whatsapp_phone")),
    primeiroNome,
    sobrenome,
    empresa,
    tags: Array.isArray(tagsBrutas) ? tagsBrutas.map((t) => texto(typeof t === "object" ? (t as Dados).name : t)).filter(Boolean) as string[] : [],
    origem: texto(primeiro(p, "source", "origem", "utm_source") ?? primeiro(dados, "source", "origem")),
    camposExtras: (primeiro(p, "custom_fields", "campos_extras") as Dados | undefined) ?? null,
  };
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Operações no CRM
// ---------------------------------------------------------------------------

interface Ctx {
  admin: SupabaseClient;
  orgId: string;
  origemPadrao: string;
}

async function acharContato(ctx: Ctx, pessoa: Pessoa): Promise<{ id: string } | null> {
  if (pessoa.email) {
    const { data } = await ctx.admin.from("contacts").select("id")
      .eq("org_id", ctx.orgId).ilike("email", pessoa.email).is("merged_into_id", null).limit(1).maybeSingle();
    if (data) return data;
  }
  if (pessoa.telefone) {
    const { data } = await ctx.admin.from("contacts").select("id")
      .eq("org_id", ctx.orgId).is("merged_into_id", null)
      .or(`whatsapp_phone.eq.${pessoa.telefone},phone.eq.${pessoa.telefone}`).limit(1).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function garantirEmpresa(ctx: Ctx, nome: string): Promise<string> {
  const { data } = await ctx.admin.from("companies").select("id").eq("org_id", ctx.orgId).ilike("name", nome).limit(1).maybeSingle();
  if (data) return data.id;
  const { data: criada, error } = await ctx.admin.from("companies").insert({ org_id: ctx.orgId, name: nome }).select("id").single();
  if (error) throw new ErroEntrada(500, `Falha ao criar a empresa: ${error.message}`);
  return criada.id;
}

async function aplicarTag(ctx: Ctx, contatoId: string, nome: string, cor = "#6366f1") {
  let { data: tag } = await ctx.admin.from("tags").select("id").eq("org_id", ctx.orgId).ilike("name", nome).limit(1).maybeSingle();
  if (!tag) {
    const { data: criada, error } = await ctx.admin.from("tags").insert({ org_id: ctx.orgId, name: nome, color: cor }).select("id").single();
    if (error) throw new ErroEntrada(500, `Falha ao criar a tag ${nome}: ${error.message}`);
    tag = criada;
  }
  const { error } = await ctx.admin.from("contact_tags").upsert(
    { contact_id: contatoId, tag_id: tag!.id },
    { onConflict: "contact_id,tag_id", ignoreDuplicates: true },
  );
  if (error) throw new ErroEntrada(500, `Falha ao aplicar a tag ${nome}: ${error.message}`);
}

/**
 * Cria ou atualiza o contato. `sobrescrever` (contact.upsert) grava todo campo
 * enviado; nos eventos de solução só preenche o que está vazio, para um evento
 * de pagamento não trocar o nome que o vendedor corrigiu à mão.
 */
async function upsertContato(ctx: Ctx, dados: Dados, sobrescrever: boolean, exigir = true) {
  const pessoa = lerPessoa(dados);
  if (!pessoa.email && !pessoa.telefone) {
    if (!exigir) return null;
    throw new ErroEntrada(422, "Informe e-mail ou telefone do contato (em data, data.contact ou data.lead).");
  }

  const existente = await acharContato(ctx, pessoa);
  const empresaId = pessoa.empresa ? await garantirEmpresa(ctx, pessoa.empresa) : null;
  const campos: Dados = {
    first_name: pessoa.primeiroNome,
    last_name: pessoa.sobrenome,
    email: pessoa.email,
    whatsapp_phone: pessoa.telefone,
    company_id: empresaId,
    custom_fields: pessoa.camposExtras,
  };

  let contatoId: string;
  let criado = false;
  if (existente) {
    contatoId = existente.id;
    const { data: atual } = await ctx.admin.from("contacts")
      .select("first_name, last_name, email, whatsapp_phone, phone, company_id, custom_fields").eq("id", contatoId).single();
    const mudancas: Dados = {};
    for (const [k, v] of Object.entries(campos)) {
      if (v === null || v === undefined) continue;
      if (k === "custom_fields") {
        mudancas.custom_fields = { ...((atual?.custom_fields as Dados) ?? {}), ...(v as Dados) };
      } else if (k === "whatsapp_phone" && (atual?.phone === v || atual?.whatsapp_phone === v)) {
        continue;
      } else if (sobrescrever || !(atual as Dados | null)?.[k]) {
        mudancas[k] = v;
      }
    }
    if (Object.keys(mudancas).length) {
      const { error } = await ctx.admin.from("contacts").update({ ...mudancas, updated_at: new Date().toISOString() }).eq("id", contatoId);
      if (error) throw new ErroEntrada(error.code === "23505" ? 409 : 500, `Falha ao atualizar o contato: ${error.message}`);
    }
  } else {
    const { data: novo, error } = await ctx.admin.from("contacts").insert({
      org_id: ctx.orgId,
      ...Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== null)),
      first_name: pessoa.primeiroNome ?? pessoa.email ?? pessoa.telefone,
      status: "lead",
      source: pessoa.origem ?? ctx.origemPadrao,
    }).select("id").single();
    if (error) {
      // Corrida com outra chamada do mesmo lead: adota quem gravou primeiro.
      const vencedor = error.code === "23505" ? await acharContato(ctx, pessoa) : null;
      if (!vencedor) throw new ErroEntrada(500, `Falha ao criar o contato: ${error.message}`);
      contatoId = vencedor.id;
    } else {
      contatoId = novo.id;
      criado = true;
    }
  }

  for (const tag of pessoa.tags) await aplicarTag(ctx, contatoId, tag);
  return { contatoId, criado, pessoa };
}

/**
 * Etapa pelo nome, a partir de um funil de referência. Em negócio novo a
 * referência é o funil padrão; em negócio existente é o funil dele, e o nome
 * nunca o tira de lá (`soNoFunil`).
 */
async function etapaPorNome(ctx: Ctx, nome: string | null, pipelineId: string | null, soNoFunil = false): Promise<string | null> {
  if (!nome) return null;
  const achada = resolverEtapaPorNome(await etapasDaOrganizacao(ctx.admin, ctx.orgId), nome, pipelineId, { soNoFunil });
  if ("etapa" in achada) return achada.etapa.id;
  if (achada.erro === "ambigua") throw new ErroEntrada(422, `Mais de um funil tem a etapa "${nome}". Renomeie uma delas ou crie o negócio pela API, que aceita o funil.`);
  throw new ErroEntrada(422, soNoFunil ? `Etapa "${nome}" não existe no funil deste negócio.` : `Etapa "${nome}" não existe no funil.`);
}

async function primeiraEtapa(ctx: Ctx, pipelineId: string | null): Promise<string | null> {
  if (!pipelineId) return null;
  return primeiraEtapaDoFunil(await etapasDaOrganizacao(ctx.admin, ctx.orgId), pipelineId)?.id ?? null;
}

async function negocioAbertoDoContato(ctx: Ctx, contatoId: string): Promise<string | null> {
  const { data } = await ctx.admin.from("deals").select("id").eq("org_id", ctx.orgId)
    .eq("contact_id", contatoId).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

function blocoNegocio(dados: Dados): Dados {
  const n = primeiro(dados, "deal", "negocio", "opportunity", "oportunidade");
  return n && typeof n === "object" ? n as Dados : dados;
}

async function criarNegocio(ctx: Ctx, dados: Dados) {
  const contato = await upsertContato(ctx, dados, false, false);
  const n = blocoNegocio(dados);
  const titulo = texto(primeiro(n, "title", "titulo", "name", "nome_negocio"))
    ?? `Negócio ${contato?.pessoa.primeiroNome ?? ""}`.trim();
  const padrao = await funilPadrao(ctx.admin, ctx.orgId);
  const etapa = (await etapaPorNome(ctx, texto(primeiro(n, "stage", "etapa")), padrao)) ?? await primeiraEtapa(ctx, padrao);
  const { data, error } = await ctx.admin.from("deals").insert({
    org_id: ctx.orgId,
    title: titulo,
    value: numero(primeiro(n, "value", "valor", "amount")) ?? 0,
    contact_id: contato?.contatoId ?? null,
    stage_id: etapa,
    status: "open",
  }).select("id").single();
  if (error) throw new ErroEntrada(500, `Falha ao criar o negócio: ${error.message}`);
  return { deal_id: data.id, contact_id: contato?.contatoId ?? null };
}

/** Negócio alvo: deal_id explícito ou o aberto mais recente do contato. */
async function negocioAlvo(ctx: Ctx, dados: Dados): Promise<{ dealId: string; contatoId: string | null }> {
  const n = blocoNegocio(dados);
  const idExplicito = texto(primeiro(n, "deal_id", "id") ?? primeiro(dados, "deal_id"));
  if (idExplicito && /^[0-9a-f-]{36}$/i.test(idExplicito)) {
    const { data } = await ctx.admin.from("deals").select("id, contact_id").eq("org_id", ctx.orgId).eq("id", idExplicito).maybeSingle();
    if (!data) throw new ErroEntrada(404, "Negócio não encontrado.");
    return { dealId: data.id, contatoId: data.contact_id };
  }
  const pessoa = lerPessoa(dados);
  const contato = await acharContato(ctx, pessoa);
  if (!contato) throw new ErroEntrada(404, "Contato não encontrado: informe deal_id ou o e-mail/telefone do contato.");
  const dealId = await negocioAbertoDoContato(ctx, contato.id);
  if (!dealId) throw new ErroEntrada(404, "O contato não tem negócio aberto.");
  return { dealId, contatoId: contato.id };
}

async function atualizarNegocio(ctx: Ctx, dados: Dados, statusForcado?: "won" | "lost") {
  const { dealId, contatoId } = await negocioAlvo(ctx, dados);
  const n = blocoNegocio(dados);
  const mudancas: Dados = { updated_at: new Date().toISOString() };
  const status = statusForcado ?? texto(primeiro(n, "status"));
  if (status) {
    if (!["open", "won", "lost"].includes(status)) throw new ErroEntrada(422, 'status deve ser "open", "won" ou "lost".');
    mudancas.status = status;
    if (status === "won") mudancas.probability = 100;
    if (status === "lost") mudancas.probability = 0;
  }
  const valor = numero(primeiro(n, "value", "valor", "amount"));
  if (valor !== null) mudancas.value = valor;
  const titulo = texto(primeiro(n, "title", "titulo"));
  if (titulo) mudancas.title = titulo;
  const nomeEtapa = texto(primeiro(n, "stage", "etapa"));
  const funilAtual = nomeEtapa ? await funilDoNegocio(ctx.admin, dealId) : null;
  // Negócio sem etapa não tem funil: a referência volta a ser o padrão.
  const etapa = await etapaPorNome(ctx, nomeEtapa, funilAtual ?? await funilPadrao(ctx.admin, ctx.orgId), funilAtual !== null);
  if (etapa) mudancas.stage_id = etapa;
  // Dono pelo e-mail do usuário do CRM (o trigger de notificação avisa quem recebeu).
  const donoEmail = texto(primeiro(n, "owner_email", "owner", "responsavel_email", "responsavel"));
  if (donoEmail) {
    const { data: dono } = await ctx.admin.from("profiles").select("id")
      .eq("org_id", ctx.orgId).ilike("email", donoEmail).eq("is_active", true).maybeSingle();
    if (!dono) throw new ErroEntrada(422, `Nenhum usuário ativo com o e-mail ${donoEmail} nesta organização.`);
    mudancas.owner_id = dono.id;
  }

  const { error } = await ctx.admin.from("deals").update(mudancas).eq("id", dealId);
  if (error) throw new ErroEntrada(500, `Falha ao atualizar o negócio: ${error.message}`);
  return { deal_id: dealId, contact_id: contatoId };
}

const TIPOS_ATIVIDADE = new Set(["call", "email", "meeting", "note", "task"]);

async function criarAtividade(ctx: Ctx, dados: Dados, tipoForcado?: string, tituloPadrao?: string, corpoExtra?: string) {
  const contato = await upsertContato(ctx, dados, false, false);
  const a = (primeiro(dados, "activity", "atividade", "appointment", "booking", "meeting", "task") as Dados | undefined) ?? dados;
  const tipo = tipoForcado ?? texto(primeiro(a, "type", "tipo")) ?? "task";
  if (!TIPOS_ATIVIDADE.has(tipo)) throw new ErroEntrada(422, `type deve ser um de: ${[...TIPOS_ATIVIDADE].join(", ")}.`);
  const titulo = texto(primeiro(a, "title", "titulo", "subject", "assunto")) ?? tituloPadrao;
  if (!titulo) throw new ErroEntrada(422, "Informe title da atividade.");
  const corpo = [texto(primeiro(a, "body", "description", "descricao", "notes", "observacao", "text")), corpoExtra]
    .filter(Boolean).join("\n\n") || null;
  const dealId = contato ? await negocioAbertoDoContato(ctx, contato.contatoId) : null;

  const { data, error } = await ctx.admin.from("activities").insert({
    org_id: ctx.orgId,
    type: tipo,
    title: titulo,
    body: corpo,
    due_date: texto(primeiro(a, "due_date", "start_time", "startTime", "starts_at", "data_hora", "scheduled_at")),
    contact_id: contato?.contatoId ?? null,
    deal_id: dealId,
  }).select("id").single();
  if (error) throw new ErroEntrada(500, `Falha ao criar a atividade: ${error.message}`);
  return { activity_id: data.id, contact_id: contato?.contatoId ?? null, deal_id: dealId };
}

// ---------------------------------------------------------------------------
// Ações e eventos aceitos
// ---------------------------------------------------------------------------

type Handler = (ctx: Ctx, dados: Dados) => Promise<Dados>;

const exigirContato = async (ctx: Ctx, dados: Dados) => {
  const r = await upsertContato(ctx, dados, false, true);
  return r!;
};

const HANDLERS: Record<string, Handler> = {
  "ping": async () => ({ pong: true }),

  "contact.upsert": async (ctx, d) => {
    const r = (await upsertContato(ctx, d, true, true))!;
    return { contact_id: r.contatoId, created: r.criado };
  },

  "lead.created": async (ctx, d) => {
    const r = await exigirContato(ctx, d);
    const titulo = texto(primeiro(blocoNegocio(d), "title", "titulo")) ?? `Lead ${r.pessoa.primeiroNome ?? r.pessoa.email ?? ""}`.trim();
    const dealId = await garantirNegocioAberto(ctx.admin, ctx.orgId, r.contatoId, titulo, { respeitarConfig: false });
    return { contact_id: r.contatoId, created: r.criado, deal_id: dealId };
  },

  "deal.create": (ctx, d) => criarNegocio(ctx, d),
  "deal.update": (ctx, d) => atualizarNegocio(ctx, d),
  "deal.won": (ctx, d) => atualizarNegocio(ctx, d, "won"),
  "deal.lost": (ctx, d) => atualizarNegocio(ctx, d, "lost"),

  "activity.create": (ctx, d) => criarAtividade(ctx, d),
  "note.create": (ctx, d) => criarAtividade(ctx, d, "note", "Anotação"),
  "appointment.scheduled": (ctx, d) => criarAtividade(ctx, d, "meeting", "Reunião agendada"),

  "tag.add": async (ctx, d) => {
    const r = await exigirContato(ctx, d);
    const tag = texto(primeiro(d, "tag", "name", "nome"));
    if (!tag) throw new ErroEntrada(422, "Informe tag.");
    await aplicarTag(ctx, r.contatoId, tag);
    return { contact_id: r.contatoId, tag };
  },

  "contract.signed": async (ctx, d) => {
    const r = await exigirContato(ctx, d);
    const documento = (primeiro(d, "envelope", "document", "documento", "contract", "contrato") as Dados | undefined) ?? {};
    const nomeDoc = texto(primeiro(documento, "title", "name", "titulo", "nome"));
    const nota = await criarAtividade(
      ctx, { ...d, title: nomeDoc ? `Contrato assinado: ${nomeDoc}` : undefined }, "note", "Contrato assinado",
      "Assinatura confirmada pela integração.",
    );
    const dealId = await negocioAbertoDoContato(ctx, r.contatoId);
    if (dealId) await ctx.admin.from("deals").update({ status: "won", probability: 100, updated_at: new Date().toISOString() }).eq("id", dealId);
    return { contact_id: r.contatoId, activity_id: nota.activity_id, deal_id: dealId, deal_won: !!dealId };
  },

  "payment.confirmed": async (ctx, d) => {
    const r = await exigirContato(ctx, d);
    const valor = numero(primeiro(d, "amount", "valor", "value"));
    const nota = await criarAtividade(ctx, d, "note", "Pagamento confirmado", valor !== null ? `Valor: ${valor}` : undefined);
    const dealId = await negocioAbertoDoContato(ctx, r.contatoId);
    if (dealId) {
      await ctx.admin.from("deals").update({
        status: "won", probability: 100, ...(valor !== null ? { value: valor } : {}), updated_at: new Date().toISOString(),
      }).eq("id", dealId);
    }
    return { contact_id: r.contatoId, activity_id: nota.activity_id, deal_id: dealId, deal_won: !!dealId };
  },

  "payment.overdue": async (ctx, d) => {
    const r = await exigirContato(ctx, d);
    await aplicarTag(ctx, r.contatoId, "Inadimplente", "#dc2626");
    const nota = await criarAtividade(ctx, d, "note", "Pagamento em atraso");
    return { contact_id: r.contatoId, activity_id: nota.activity_id, tag: "Inadimplente" };
  },

  "nps.submitted": async (ctx, d) => {
    const r = await exigirContato(ctx, d);
    const n = (primeiro(d, "nps", "feedback", "review", "avaliacao") as Dados | undefined) ?? d;
    const nota = numero(primeiro(n, "score", "nota", "score_nps", "rating"));
    if (nota === null) throw new ErroEntrada(422, "Informe score (0 a 10).");
    const comentario = texto(primeiro(n, "comment", "comentario", "texto_feedback", "feedback", "text"));
    const atividade = await criarAtividade(ctx, { ...d, title: `NPS ${nota}` }, "note", undefined, comentario ?? undefined);
    if (nota <= 6) await aplicarTag(ctx, r.contatoId, "Detrator", "#dc2626");
    if (nota >= 9) await aplicarTag(ctx, r.contatoId, "Promotor", "#16a34a");
    return { contact_id: r.contatoId, activity_id: atividade.activity_id, score: nota };
  },
};

/** Nomes que as outras soluções já usam, apontando para a ação do CRM. */
const SINONIMOS: Record<string, string> = {
  "contact.created": "contact.upsert",
  "contact.updated": "contact.upsert",
  "lead.captured": "lead.created",
  "lead.qualified": "lead.created",
  "deal.created": "deal.create",
  "deal.updated": "deal.update",
  "deal.stage_changed": "deal.update",
  "deal.move": "deal.update",
  "activity.created": "activity.create",
  "task.create": "activity.create",
  "note.created": "note.create",
  "appointment.created": "appointment.scheduled",
  "booking.created": "appointment.scheduled",
  "meeting.scheduled": "appointment.scheduled",
  "envelope.completed": "contract.signed",
  "document.signed": "contract.signed",
  "payment.received": "payment.confirmed",
  "transaction.confirmed": "payment.confirmed",
  "invoice.paid": "payment.confirmed",
  "invoice.overdue": "payment.overdue",
  "feedback.received": "nps.submitted",
  "review.created": "nps.submitted",
};

function resolverAcao(nome: string): string | null {
  const n = nome.trim().toLowerCase();
  return HANDLERS[n] ? n : SINONIMOS[n] ?? null;
}

const AVISO_ACOES = `Aceitos: ${[...Object.keys(HANDLERS), ...Object.keys(SINONIMOS)].sort().join(", ")}.`;

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);

  const chave = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
    || req.headers.get("x-webhook-token") || req.headers.get("x-api-key") || url.searchParams.get("token") || "";
  if (!chave.startsWith("fcrm_")) return json({ error: "Chave ausente. Envie Authorization: Bearer fcrm_..." }, 401);

  const { data: registro } = await admin.from("webhook_inbound_keys")
    .select("id, org_id, name, is_active").eq("key_hash", await sha256Hex(chave)).maybeSingle();
  if (!registro || !registro.is_active) return json({ error: "Chave inválida ou revogada." }, 401);

  const raw = await req.text();
  let corpo: Dados | null = null;
  try {
    const parsed = JSON.parse(raw);
    corpo = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { /* tratado abaixo */ }

  const idempotencia = req.headers.get("Idempotency-Key") ?? req.headers.get("X-Idempotency-Key")
    ?? (corpo && typeof corpo.id === "string" && corpo.data ? corpo.id : null);

  // Linha reservada com a Idempotency-Key: o desfecho atualiza ela em vez de criar outra.
  let reserva: string | null = null;
  const registrar = async (status: "success" | "failed" | "duplicate", http: number, acao: string | null, resposta: Dados, erro?: string) => {
    const linha = {
      action: acao, status, http_status: http, response: resposta, error: erro ?? null,
    };
    if (reserva && status !== "duplicate") {
      await admin.from("webhook_inbound_logs").update(linha).eq("id", reserva);
      return;
    }
    await admin.from("webhook_inbound_logs").insert({
      ...linha, org_id: registro.org_id, key_id: registro.id,
      idempotency_key: status === "duplicate" ? null : idempotencia,
      request: corpo ?? { raw: raw.slice(0, 2000) },
    });
  };
  await admin.from("webhook_inbound_keys").update({ last_used_at: new Date().toISOString() }).eq("id", registro.id);

  if (!corpo) {
    const resposta = { error: "Corpo inválido: envie um objeto JSON." };
    await registrar("failed", 400, null, resposta, resposta.error);
    return json(resposta, 400);
  }

  if (idempotencia) {
    // Reserva antes de executar. O índice único só deixa uma chamada reservar a
    // mesma chave; quem chega depois recebe a resposta original (ou 409 se a
    // primeira ainda está rodando).
    const { data: reservada, error: erroReserva } = await admin.from("webhook_inbound_logs").insert({
      org_id: registro.org_id, key_id: registro.id, idempotency_key: idempotencia,
      status: "processing", http_status: 102, request: corpo,
    }).select("id").single();
    if (reservada) {
      reserva = reservada.id;
    } else if (erroReserva?.code === "23505") {
      const { data: anterior } = await admin.from("webhook_inbound_logs").select("status, response")
        .eq("key_id", registro.id).eq("idempotency_key", idempotencia).in("status", ["processing", "success"])
        .limit(1).maybeSingle();
      if (anterior?.status === "success") {
        const resposta = { ...(anterior.response as Dados), duplicate: true };
        await registrar("duplicate", 200, null, resposta);
        return json(resposta);
      }
      return json({ error: "Esta Idempotency-Key ainda está sendo processada. Tente de novo em instantes." }, 409);
    } else {
      return json({ error: `Falha ao registrar a chamada: ${erroReserva?.message}` }, 500);
    }
  }

  const nomeInformado = texto(corpo.action ?? corpo.event ?? corpo.event_type ?? corpo.type);
  const dados = (corpo.data && typeof corpo.data === "object" ? corpo.data : corpo.payload && typeof corpo.payload === "object" ? corpo.payload : corpo) as Dados;
  // Corpo plano sem ação: é a linha de um lead (TypeFlow, formulário, planilha).
  const acao = nomeInformado ? resolverAcao(nomeInformado) : "lead.created";

  if (!acao) {
    const resposta = { error: `Ação ou evento desconhecido: ${nomeInformado}. ${AVISO_ACOES}` };
    await registrar("failed", 400, nomeInformado, resposta, resposta.error);
    return json(resposta, 400);
  }

  const ctx: Ctx = { admin, orgId: registro.org_id, origemPadrao: `webhook: ${registro.name}` };
  try {
    const resultado = await HANDLERS[acao](ctx, dados);
    const resposta = { ok: true, action: acao, ...resultado };
    await registrar("success", 200, acao, resposta);
    return json(resposta);
  } catch (err) {
    const status = err instanceof ErroEntrada ? err.status : 500;
    const mensagem = err instanceof Error ? err.message : "Erro inesperado";
    const resposta = { error: mensagem, action: acao };
    await registrar("failed", status, acao, resposta, mensagem);
    return json(resposta, status);
  }
});
