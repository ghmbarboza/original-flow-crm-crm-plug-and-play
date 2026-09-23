// Agenda da IA (Sprint 12 B11): política de horários, evidência literal,
// disponibilidade (tabela + free/busy), ações auditadas e ferramentas do modelo.
// Porte de action-policy.ts, action-audit.ts e das ferramentas do
// nina-orchestrator da Nina Zernio para o modelo multi-tenant do CRM.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { FerramentaIA } from "./ai.ts";
import { apagarEvento, credenciaisNylas, ocupacoes, sincronizarEvento, type IntegracaoCalendario } from "./nylas.ts";

export interface PoliticaAgenda {
  ai_enabled: boolean;
  default_duration_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  weekdays: number[];
  start_time: string;
  end_time: string;
  require_literal_confirmation: boolean;
  default_owner_id: string | null;
  reminder_minutes_before: number;
  reminder_text: string;
  reminder_template_name: string | null;
  no_show_after_minutes: number;
  no_show_text: string;
}

export const POLITICA_PADRAO: PoliticaAgenda = {
  ai_enabled: false, default_duration_minutes: 30, buffer_minutes: 15, min_notice_minutes: 120, max_days_ahead: 60,
  weekdays: [1, 2, 3, 4, 5], start_time: "09:00", end_time: "18:00", require_literal_confirmation: true, default_owner_id: null,
  reminder_minutes_before: 1440,
  reminder_text: 'Oi {{contact.first_name}}! Passando para lembrar da nossa reunião "{{appointment.title}}" em {{appointment.when}}. Responda "confirmo" para confirmar ou me avise se precisar remarcar.',
  reminder_template_name: null, no_show_after_minutes: 15,
  no_show_text: "Oi {{contact.first_name}}, não conseguimos nos falar em {{appointment.when}}. Quer remarcar? Me diga um dia e horário que funcionem para você.",
};

const MIN_EVIDENCIA = 6;
const MAX_TITULO = 120;
/** Palavras que mostram intenção na frase citada: confirmar horário ou cancelar. */
const INTENCAO_CONFIRMAR = /(confirm|pode marcar|pode agendar|fechad|combinad|marca(r|do)? (pra|para|no|na|às|as|dia)|t[aá] bom|tudo bem|beleza|perfeito|ok|sim|isso|serve|funciona|agend|\d{1,2}[:h]\d{0,2}|\d{1,2}\/\d{1,2})/;
const INTENCAO_CANCELAR = /(cancel|desmarc|n[aã]o vou|n[aã]o consigo|n[aã]o d[aá]|desist|deixa pra|deixa para|remarc|adiar|outro dia)/;
const MENSAGENS_EVIDENCIA = 6;
const DURACAO_MIN = 15;
const DURACAO_MAX = 240;

export async function carregarPolitica(admin: SupabaseClient, orgId: string): Promise<PoliticaAgenda> {
  const { data } = await admin.from("scheduling_policies").select("*").eq("org_id", orgId).maybeSingle();
  return data ? { ...POLITICA_PADRAO, ...(data as Partial<PoliticaAgenda>) } : { ...POLITICA_PADRAO };
}

export async function fusoDaOrg(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await admin.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  return (data?.timezone as string | undefined) || "America/Sao_Paulo";
}

// --- Datas no fuso da org --------------------------------------------------------

/** Partes de uma data num fuso IANA (ano, mês, dia, hora, minuto, dia da semana). */
export function partesNoFuso(d: Date, fuso: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour), minuto: Number(p.minute), diaSemana: dias[p.weekday] ?? 0 };
}

/** Converte "AAAA-MM-DD" + "HH:MM" no fuso para um instante UTC (trata horário de verão). */
export function instanteNoFuso(data: string, hora: string, fuso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!m || !h) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [hh, mm] = [Number(h[1]), Number(h[2])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hh > 23 || mm > 59) return null;
  const alvo = Date.UTC(ano, mes - 1, dia, hh, mm);
  let palpite = alvo;
  for (let i = 0; i < 3; i++) {
    const p = partesNoFuso(new Date(palpite), fuso);
    const diff = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto) - alvo;
    if (diff === 0) break;
    palpite -= diff;
  }
  // Horário que não existe (salto do horário de verão) não converge: recusa em vez de devolver 1h errada.
  const conf = partesNoFuso(new Date(palpite), fuso);
  if (conf.ano !== ano || conf.mes !== mes || conf.dia !== dia || conf.hora !== hh || conf.minuto !== mm) return null;
  return new Date(palpite);
}

export function formatarQuando(d: Date, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

// --- Política -------------------------------------------------------------------

export type CodigoPolitica =
  | "invalid_date_time" | "invalid_duration" | "date_in_past" | "minimum_notice" | "maximum_advance" | "weekday_not_allowed" | "outside_business_hours";

const MENSAGEM_POLITICA: Record<CodigoPolitica, string> = {
  invalid_date_time: "Data ou hora inválida. Use AAAA-MM-DD e HH:MM.",
  invalid_duration: `Duração precisa ficar entre ${DURACAO_MIN} e ${DURACAO_MAX} minutos.`,
  date_in_past: "Esse horário já passou.",
  minimum_notice: "Esse horário é cedo demais: precisa de mais antecedência.",
  maximum_advance: "Esse horário está longe demais no futuro.",
  weekday_not_allowed: "A empresa não atende nesse dia da semana.",
  outside_business_hours: "Esse horário está fora do expediente.",
};

export function validarPedido(
  politica: PoliticaAgenda, fuso: string, data: string, hora: string, duracao: number | null, agora = new Date(),
): { ok: true; inicio: Date; fim: Date; duracao: number } | { ok: false; codigo: CodigoPolitica; mensagem: string } {
  const dur = duracao ?? politica.default_duration_minutes;
  const falha = (codigo: CodigoPolitica) => ({ ok: false as const, codigo, mensagem: MENSAGEM_POLITICA[codigo] });
  if (!Number.isFinite(dur) || dur < DURACAO_MIN || dur > DURACAO_MAX) return falha("invalid_duration");
  const inicio = instanteNoFuso(data, hora, fuso);
  if (!inicio) return falha("invalid_date_time");
  const fim = new Date(inicio.getTime() + dur * 60_000);
  if (inicio.getTime() <= agora.getTime()) return falha("date_in_past");
  if (inicio.getTime() - agora.getTime() < politica.min_notice_minutes * 60_000) return falha("minimum_notice");
  if (inicio.getTime() - agora.getTime() > politica.max_days_ahead * 86_400_000) return falha("maximum_advance");
  const p = partesNoFuso(inicio, fuso);
  if (!politica.weekdays.includes(p.diaSemana)) return falha("weekday_not_allowed");
  const [ih, im] = politica.start_time.split(":").map(Number);
  const [fh, fm] = politica.end_time.split(":").map(Number);
  const minutoInicio = p.hora * 60 + p.minuto;
  if (minutoInicio < ih * 60 + im || minutoInicio + dur > fh * 60 + fm) return falha("outside_business_hours");
  return { ok: true, inicio, fim, duracao: dur };
}

// --- Evidência literal ---------------------------------------------------------

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * A citação precisa estar, literalmente, numa das últimas mensagens do lead E
 * carregar a intenção da ação (confirmar um horário ou cancelar). Só substring
 * deixava o modelo citar qualquer trecho de 4 letras como "confirmação".
 */
export function evidenciaConfere(evidencia: unknown, mensagensDoLead: string[], acao: "confirmar" | "cancelar" = "confirmar"): boolean {
  const e = normalizar(String(evidencia ?? ""));
  if (e.length < MIN_EVIDENCIA) return false;
  const intencao = acao === "cancelar" ? INTENCAO_CANCELAR : INTENCAO_CONFIRMAR;
  if (!intencao.test(e)) return false;
  return mensagensDoLead.slice(-MENSAGENS_EVIDENCIA).some((m) => normalizar(m).includes(e));
}

/** Título vindo da conversa: sem controle, sem quebra de linha, tamanho limitado. */
export function tituloSeguro(bruto: unknown, padrao: string): string {
  const t = String(bruto ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TITULO);
  return t || padrao;
}

// --- Disponibilidade ----------------------------------------------------------------

async function integracaoDoDono(admin: SupabaseClient, ownerId: string | null): Promise<IntegracaoCalendario | null> {
  if (!ownerId) return null;
  const { data } = await admin.from("calendar_integrations").select("*").eq("user_id", ownerId).eq("status", "connected").eq("sync_enabled", true).maybeSingle();
  return (data as IntegracaoCalendario | null) ?? null;
}

export interface Ocupacao { inicio: number; fim: number; origem: "tabela" | "calendario" }

/**
 * Carrega de uma vez tudo que ocupa a agenda do dono (ou da org, sem dono) na
 * janela: reuniões vivas da tabela e free/busy do calendário externo. Uma
 * consulta e uma chamada ao Nylas por janela, não por horário testado.
 */
export async function carregarOcupacao(
  admin: SupabaseClient, orgId: string, ownerId: string | null, janelaInicio: Date, janelaFim: Date, ignorarId: string | null = null,
): Promise<Ocupacao[]> {
  let q = admin.from("appointments").select("id, starts_at, ends_at").eq("org_id", orgId).in("status", ["scheduled", "confirmed"])
    .lt("starts_at", janelaFim.toISOString()).gt("ends_at", janelaInicio.toISOString()).limit(500);
  if (ownerId) q = q.eq("owner_id", ownerId);
  else q = q.is("owner_id", null);
  if (ignorarId) q = q.neq("id", ignorarId);
  const { data } = await q;
  const ocupacao: Ocupacao[] = (data ?? []).map((a) => ({ inicio: new Date(a.starts_at).getTime(), fim: new Date(a.ends_at).getTime(), origem: "tabela" }));
  const integracao = await integracaoDoDono(admin, ownerId);
  if (integracao) {
    const cred = await credenciaisNylas(admin, orgId);
    if (cred) {
      for (const o of await ocupacoes(cred, integracao, janelaInicio, janelaFim)) {
        ocupacao.push({ inicio: new Date(o.start).getTime(), fim: new Date(o.end).getTime(), origem: "calendario" });
      }
    }
  }
  return ocupacao;
}

/** Motivo do conflito de um horário contra a ocupação carregada, com o buffer da política. */
export function motivoConflito(ocupacao: Ocupacao[], inicio: Date, fim: Date, bufferMin: number): string | null {
  const ini = inicio.getTime() - bufferMin * 60_000;
  const fi = fim.getTime() + bufferMin * 60_000;
  const bate = ocupacao.find((o) => o.inicio < fi && o.fim > ini);
  if (!bate) return null;
  return bate.origem === "tabela" ? "já existe uma reunião nesse horário" : "o calendário do responsável está ocupado nesse horário";
}

/** Conflito de um único horário (carrega só a janela dele). */
export async function conflito(
  admin: SupabaseClient, orgId: string, ownerId: string | null, inicio: Date, fim: Date, bufferMin: number, ignorarId: string | null = null,
): Promise<string | null> {
  const ocupacao = await carregarOcupacao(admin, orgId, ownerId, new Date(inicio.getTime() - bufferMin * 60_000), new Date(fim.getTime() + bufferMin * 60_000), ignorarId);
  return motivoConflito(ocupacao, inicio, fim, bufferMin);
}

/** Sugere até `quantos` horários livres no mesmo dia (ou nos próximos), dentro da política. */
export async function sugerirHorarios(
  admin: SupabaseClient, orgId: string, ownerId: string | null, politica: PoliticaAgenda, fuso: string, aPartirDe: Date, duracao: number, quantos = 3,
): Promise<Date[]> {
  const sugestoes: Date[] = [];
  const [ih, im] = politica.start_time.split(":").map(Number);
  const passo = 30 * 60_000;
  const DIAS = 14;
  const ocupacao = await carregarOcupacao(admin, orgId, ownerId, aPartirDe, new Date(aPartirDe.getTime() + DIAS * 86_400_000));
  for (let dia = 0; dia < DIAS && sugestoes.length < quantos; dia++) {
    const base = new Date(aPartirDe.getTime() + dia * 86_400_000);
    const p = partesNoFuso(base, fuso);
    const dataStr = `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
    let cursor = instanteNoFuso(dataStr, `${String(ih).padStart(2, "0")}:${String(im).padStart(2, "0")}`, fuso);
    if (!cursor) continue;
    for (let i = 0; i < 40 && sugestoes.length < quantos; i++, cursor = new Date(cursor.getTime() + passo)) {
      const pc = partesNoFuso(cursor, fuso);
      const v = validarPedido(politica, fuso, dataStr, `${String(pc.hora).padStart(2, "0")}:${String(pc.minuto).padStart(2, "0")}`, duracao);
      if (!v.ok) { if (v.codigo === "outside_business_hours") break; continue; }
      if (motivoConflito(ocupacao, v.inicio, v.fim, politica.buffer_minutes)) continue;
      sugestoes.push(v.inicio);
    }
  }
  return sugestoes;
}

// --- Sincronização com o calendário externo ----------------------------------------------

export async function sincronizarComCalendario(admin: SupabaseClient, appointmentId: string): Promise<void> {
  const { data: ap } = await admin.from("appointments").select("*, contacts(email, first_name, last_name)").eq("id", appointmentId).maybeSingle();
  if (!ap) return;
  const integracao = await integracaoDoDono(admin, ap.owner_id as string | null);
  if (!integracao) return;
  const cred = await credenciaisNylas(admin, ap.org_id as string);
  if (!cred) return;
  try {
    if (ap.status === "cancelled" || ap.status === "no_show") {
      if (ap.external_event_id) await apagarEvento(cred, integracao, ap.external_event_id as string);
      await admin.from("appointments").update({ calendar_sync_status: "synced", calendar_sync_error: null }).eq("id", appointmentId);
      return;
    }
    const contato = ap.contacts as { email?: string | null; first_name?: string; last_name?: string | null } | null;
    const participants = contato?.email ? [{ email: contato.email, name: [contato.first_name, contato.last_name].filter(Boolean).join(" ") || null }] : [];
    if (integracao.account_email) participants.push({ email: integracao.account_email, name: null });
    const r = await sincronizarEvento(cred, integracao, {
      id: ap.id as string, title: ap.title as string, description: (ap.description as string | null) ?? null,
      starts_at: ap.starts_at as string, ends_at: ap.ends_at as string, timezone: ap.timezone as string, participants,
    }, (ap.external_event_id as string | null) ?? null);
    await admin.from("appointments").update({
      external_event_id: r.externalId, calendar_sync_status: "synced", calendar_sync_error: null, ...(r.meetingUrl && !ap.meeting_url ? { meeting_url: r.meetingUrl } : {}),
    }).eq("id", appointmentId);
    await admin.from("calendar_integrations").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", integracao.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("appointments").update({ calendar_sync_status: "error", calendar_sync_error: msg }).eq("id", appointmentId);
    await admin.from("calendar_integrations").update({ last_error: msg }).eq("id", integracao.id);
  }
}

// --- Auditoria ------------------------------------------------------------------------

function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function estavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${estavel((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export interface ContextoAcao {
  orgId: string;
  conversationId: string | null;
  contactId: string | null;
  sourceMessageId: string | null;
}

/**
 * Roda uma ação da IA com registro em agent_action_runs. A mesma mensagem com
 * os mesmos argumentos não executa duas vezes: devolve o resultado gravado.
 */
export async function acaoAuditada(
  admin: SupabaseClient, ctx: ContextoAcao, actionKey: string, input: Record<string, unknown>,
  executar: () => Promise<{ ok: boolean; codigo?: string; resultado: Record<string, unknown> }>,
): Promise<Record<string, unknown>> {
  const idem = `${ctx.sourceMessageId ?? "sem-msg"}:${actionKey}:${fnv1a(estavel(input))}`;
  const { data: run, error } = await admin.from("agent_action_runs").insert({
    org_id: ctx.orgId, conversation_id: ctx.conversationId, contact_id: ctx.contactId, source_message_id: ctx.sourceMessageId,
    action_key: actionKey, idempotency_key: idem, input,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") {
      const { data: anterior } = await admin.from("agent_action_runs").select("status, output").eq("org_id", ctx.orgId).eq("idempotency_key", idem).maybeSingle();
      if (anterior?.status === "succeeded" && anterior.output) return anterior.output as Record<string, unknown>;
      return { ok: false, aviso: "Essa ação já foi tentada para esta mensagem." };
    }
    return { ok: false, aviso: `Não foi possível registrar a ação (${error.message}).` };
  }
  try {
    const r = await executar();
    await admin.from("agent_action_runs").update({
      status: r.ok ? "succeeded" : "refused", error_code: r.codigo ?? null, output: r.resultado, finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    return r.resultado;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("agent_action_runs").update({ status: "failed", error_code: "exception", output: { erro: msg }, finished_at: new Date().toISOString() }).eq("id", run.id);
    return { ok: false, aviso: `A ação falhou (${msg}). Diga que vai confirmar com a equipe.` };
  }
}

// --- Ferramentas do modelo ------------------------------------------------------------

export const FERRAMENTAS_AGENDA: FerramentaIA[] = [
  {
    name: "consultar_disponibilidade",
    description: "Verifica se um dia e horário estão livres para uma reunião e sugere alternativas. Use antes de propor horários ao cliente.",
    parameters: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data no formato AAAA-MM-DD" },
        hora: { type: "string", description: "Hora no formato HH:MM (24h). Se o cliente não disse, use 09:00 para ver sugestões do dia." },
        duracao: { type: "number", description: "Duração em minutos (opcional)" },
      },
      required: ["data", "hora"],
    },
  },
  {
    name: "agendar_reuniao",
    description: "Agenda a reunião SOMENTE depois que o cliente confirmou dia e horário com as próprias palavras. Copie em `evidencia` a frase exata em que ele confirmou.",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título curto da reunião (opcional)" },
        data: { type: "string", description: "Data AAAA-MM-DD" },
        hora: { type: "string", description: "Hora HH:MM" },
        duracao: { type: "number", description: "Duração em minutos (opcional)" },
        evidencia: { type: "string", description: "Trecho literal da mensagem do cliente confirmando o horário" },
      },
      required: ["data", "hora", "evidencia"],
    },
  },
  {
    name: "remarcar_reuniao",
    description: "Remarca a próxima reunião deste cliente para outro dia e horário que ele confirmou com as próprias palavras.",
    parameters: {
      type: "object",
      properties: {
        nova_data: { type: "string", description: "Data AAAA-MM-DD" },
        nova_hora: { type: "string", description: "Hora HH:MM" },
        motivo: { type: "string", description: "Motivo em uma frase (opcional)" },
        evidencia: { type: "string", description: "Trecho literal da mensagem do cliente confirmando o novo horário" },
      },
      required: ["nova_data", "nova_hora", "evidencia"],
    },
  },
  {
    name: "cancelar_reuniao",
    description: "Cancela a próxima reunião deste cliente quando ele pediu isso claramente. Copie em `evidencia` a frase exata do pedido.",
    parameters: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Motivo em uma frase (opcional)" },
        evidencia: { type: "string", description: "Trecho literal da mensagem do cliente pedindo o cancelamento" },
      },
      required: ["evidencia"],
    },
  },
];

export interface AmbienteAgenda extends ContextoAcao {
  dealId: string | null;
  mensagensDoLead: string[];
  nomeContato: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function proximaReuniao(admin: SupabaseClient, orgId: string, contactId: string | null) {
  if (!contactId) return null;
  const { data } = await admin.from("appointments").select("id, title, starts_at, ends_at, owner_id, timezone")
    .eq("org_id", orgId).eq("contact_id", contactId).in("status", ["scheduled", "confirmed"]).gt("ends_at", new Date().toISOString())
    .order("starts_at").limit(1).maybeSingle();
  return data;
}

/** Executa uma das quatro ferramentas e devolve o JSON que o modelo lê. */
export async function executarFerramentaAgenda(admin: SupabaseClient, amb: AmbienteAgenda, nome: string, args: Record<string, unknown>): Promise<string> {
  const politica = await carregarPolitica(admin, amb.orgId);
  const fuso = await fusoDaOrg(admin, amb.orgId);
  const donoId = politica.default_owner_id;
  const duracaoArg = Number(args.duracao) || null;

  if (nome === "consultar_disponibilidade") {
    const v = validarPedido(politica, fuso, str(args.data), str(args.hora), duracaoArg);
    const base = v.ok ? v.inicio : instanteNoFuso(str(args.data), "09:00", fuso) ?? new Date();
    const sugestoes = await sugerirHorarios(admin, amb.orgId, donoId, politica, fuso, base, duracaoArg ?? politica.default_duration_minutes);
    const alternativas = sugestoes.map((d) => formatarQuando(d, fuso));
    if (!v.ok) return JSON.stringify({ disponivel: false, motivo: v.mensagem, alternativas });
    const motivo = await conflito(admin, amb.orgId, donoId, v.inicio, v.fim, politica.buffer_minutes);
    return JSON.stringify({ disponivel: !motivo, ...(motivo ? { motivo } : {}), horario: formatarQuando(v.inicio, fuso), alternativas });
  }

  const exigeEvidencia = politica.require_literal_confirmation;
  if (exigeEvidencia && !evidenciaConfere(args.evidencia, amb.mensagensDoLead, nome === "cancelar_reuniao" ? "cancelar" : "confirmar")) {
    return JSON.stringify({ ok: false, codigo: "explicit_confirmation_required", instrucao: "Antes de agir, peça ao cliente para confirmar claramente (dia, horário ou o cancelamento) e use a frase exata dele em `evidencia`." });
  }

  if (nome === "agendar_reuniao") {
    return JSON.stringify(await acaoAuditada(admin, amb, "agendar_reuniao", args, async () => {
      const v = validarPedido(politica, fuso, str(args.data), str(args.hora), duracaoArg);
      if (!v.ok) return { ok: false, codigo: v.codigo, resultado: { ok: false, motivo: v.mensagem } };
      const motivo = await conflito(admin, amb.orgId, donoId, v.inicio, v.fim, politica.buffer_minutes);
      if (motivo) {
        const alternativas = (await sugerirHorarios(admin, amb.orgId, donoId, politica, fuso, v.inicio, v.duracao)).map((d) => formatarQuando(d, fuso));
        return { ok: false, codigo: "slot_taken", resultado: { ok: false, motivo, alternativas } };
      }
      const titulo = tituloSeguro(args.titulo, `Reunião com ${tituloSeguro(amb.nomeContato, "cliente")}`);
      const { data: ap, error } = await admin.from("appointments").insert({
        org_id: amb.orgId, contact_id: amb.contactId, deal_id: amb.dealId, owner_id: donoId, conversation_id: amb.conversationId,
        title: titulo, starts_at: v.inicio.toISOString(), ends_at: v.fim.toISOString(), timezone: fuso, source: "ia",
        calendar_sync_status: donoId ? "pending" : "none", metadata: { evidencia: str(args.evidencia) },
      }).select("id").single();
      if (error || !ap) {
        const ocupado = error?.code === "23P01";
        return { ok: false, codigo: ocupado ? "slot_taken" : "insert_failed", resultado: { ok: false, motivo: ocupado ? "esse horário acabou de ser ocupado; ofereça outro" : (error?.message ?? "falha ao gravar") } };
      }
      await sincronizarComCalendario(admin, ap.id);
      const { data: salvo } = await admin.from("appointments").select("meeting_url").eq("id", ap.id).maybeSingle();
      return { ok: true, resultado: { ok: true, reuniao_id: ap.id, quando: formatarQuando(v.inicio, fuso), duracao_minutos: v.duracao, ...(salvo?.meeting_url ? { link: salvo.meeting_url } : {}), instrucao: "Confirme ao cliente o dia e horário exatamente como agendado." } };
    }));
  }

  if (nome === "remarcar_reuniao") {
    return JSON.stringify(await acaoAuditada(admin, amb, "remarcar_reuniao", args, async () => {
      const atual = await proximaReuniao(admin, amb.orgId, amb.contactId);
      if (!atual) return { ok: false, codigo: "no_appointment", resultado: { ok: false, motivo: "Este cliente não tem reunião marcada. Ofereça agendar uma nova." } };
      const v = validarPedido(politica, fuso, str(args.nova_data), str(args.nova_hora), duracaoArg ?? Math.round((new Date(atual.ends_at).getTime() - new Date(atual.starts_at).getTime()) / 60_000));
      if (!v.ok) return { ok: false, codigo: v.codigo, resultado: { ok: false, motivo: v.mensagem } };
      const motivo = await conflito(admin, amb.orgId, atual.owner_id as string | null, v.inicio, v.fim, politica.buffer_minutes, atual.id);
      if (motivo) return { ok: false, codigo: "slot_taken", resultado: { ok: false, motivo } };
      const { error } = await admin.from("appointments").update({
        starts_at: v.inicio.toISOString(), ends_at: v.fim.toISOString(), status: "scheduled", confirmed_at: null, reminder_sent_at: null,
        calendar_sync_status: atual.owner_id ? "pending" : "none", metadata: { evidencia: str(args.evidencia), motivo: str(args.motivo) || null },
      }).eq("id", atual.id);
      if (error) return { ok: false, codigo: "update_failed", resultado: { ok: false, motivo: error.message } };
      await sincronizarComCalendario(admin, atual.id);
      return { ok: true, resultado: { ok: true, reuniao_id: atual.id, quando: formatarQuando(v.inicio, fuso), instrucao: "Confirme ao cliente o novo dia e horário." } };
    }));
  }

  if (nome === "cancelar_reuniao") {
    return JSON.stringify(await acaoAuditada(admin, amb, "cancelar_reuniao", args, async () => {
      const atual = await proximaReuniao(admin, amb.orgId, amb.contactId);
      if (!atual) return { ok: false, codigo: "no_appointment", resultado: { ok: false, motivo: "Este cliente não tem reunião marcada." } };
      const { error } = await admin.from("appointments").update({ status: "cancelled", cancel_reason: str(args.motivo) || "Cancelada pelo cliente na conversa", calendar_sync_status: atual.owner_id ? "pending" : "none" }).eq("id", atual.id);
      if (error) return { ok: false, codigo: "update_failed", resultado: { ok: false, motivo: error.message } };
      await sincronizarComCalendario(admin, atual.id);
      return { ok: true, resultado: { ok: true, reuniao_id: atual.id, instrucao: "Confirme o cancelamento e ofereça remarcar quando fizer sentido." } };
    }));
  }
  return JSON.stringify({ ok: false, aviso: "Ferramenta desconhecida." });
}

/** Trecho do system prompt quando a agenda da IA está ligada. */
export function instrucaoAgenda(politica: PoliticaAgenda, fuso: string, agora = new Date()): string {
  const hoje = formatarQuando(agora, fuso);
  return [
    `\nAGENDA: você pode marcar reuniões. Agora é ${hoje} (fuso ${fuso}). Atendimento ${politica.start_time} às ${politica.end_time}, duração padrão ${politica.default_duration_minutes} min.`,
    "Fluxo: use consultar_disponibilidade para checar o horário pedido e sugerir alternativas; só chame agendar_reuniao, remarcar_reuniao ou cancelar_reuniao depois que o cliente confirmar com as próprias palavras, copiando a frase dele em `evidencia`.",
    "Nunca diga que a reunião está marcada antes de a ferramenta devolver ok: true.",
  ].join("\n");
}
