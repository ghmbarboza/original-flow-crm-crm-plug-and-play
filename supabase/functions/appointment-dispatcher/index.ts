// Lembrete e no-show das reuniões (Sprint 12 B11). Cron a cada 5 minutos.
//
//  1. Lembrete: reuniões vivas que começam em até `reminder_minutes_before`
//     e ainda não receberam lembrete → WhatsApp ao contato pelo canal da org
//     (Evolution texto; Meta e Zernio pelo template configurado), ou e-mail
//     quando o contato não tem WhatsApp. Marca reminder_sent_at.
//  2. No-show: reuniões que começaram há mais de `no_show_after_minutes`,
//     ainda 'scheduled' (não confirmadas nem realizadas) → status no_show.
//     O trigger do banco avisa o dono e enfileira a automação
//     appointment.no_show; aqui vai a mensagem ao contato oferecendo remarcar.
//
// Protegida por x-cron-secret (Vault) ou chamada interna (service role).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamadaInterna, cronAutorizado, naoAutorizado } from "../_shared/seguranca.ts";
import { enviarEmail } from "../_shared/email.ts";
import { enviarWhatsappOrg } from "../_shared/whatsappOrg.ts";
import { carregarPolitica, formatarQuando, type PoliticaAgenda } from "../_shared/agenda.ts";

const LOTE = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface Reuniao {
  id: string; org_id: string; contact_id: string | null; title: string; starts_at: string; timezone: string; status: string;
  contacts: { first_name: string; last_name: string | null; whatsapp_phone: string | null; phone: string | null; email: string | null } | null;
}

function render(modelo: string, r: Reuniao): string {
  const vars: Record<string, string> = {
    "contact.first_name": r.contacts?.first_name ?? "",
    "contact.name": [r.contacts?.first_name, r.contacts?.last_name].filter(Boolean).join(" "),
    "appointment.title": r.title,
    "appointment.when": formatarQuando(new Date(r.starts_at), r.timezone),
  };
  return modelo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

function digitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

async function avisarContato(admin: SupabaseClient, r: Reuniao, texto: string, templateNome: string | null, assunto: string): Promise<{ ok: boolean; canal: string; motivo?: string }> {
  const numero = digitos(r.contacts?.whatsapp_phone) || digitos(r.contacts?.phone);
  if (numero.length >= 10) {
    const w = await enviarWhatsappOrg(admin, r.org_id, numero, texto, templateNome);
    if (w.ok) return { ok: true, canal: "whatsapp" };
    if (!r.contacts?.email) return { ok: false, canal: "whatsapp", motivo: w.motivo };
  }
  if (r.contacts?.email) {
    const e = await enviarEmail(admin, { orgId: r.org_id, to: r.contacts.email, subject: assunto, text: texto, html: `<p>${texto.replace(/\n/g, "<br>")}</p>` });
    return e.ok ? { ok: true, canal: "email" } : { ok: false, canal: "email", motivo: e.motivo };
  }
  return { ok: false, canal: "nenhum", motivo: "contato sem WhatsApp nem e-mail" };
}

const politicas = new Map<string, PoliticaAgenda>();
async function politicaDe(admin: SupabaseClient, orgId: string): Promise<PoliticaAgenda> {
  if (!politicas.has(orgId)) politicas.set(orgId, await carregarPolitica(admin, orgId));
  return politicas.get(orgId)!;
}

async function lembretes(admin: SupabaseClient, agora: Date) {
  // Janela ampla (7 dias); a política de cada org decide o momento exato.
  const { data } = await admin.from("appointments")
    .select("id, org_id, contact_id, title, starts_at, timezone, status, contacts(first_name, last_name, whatsapp_phone, phone, email)")
    .in("status", ["scheduled", "confirmed"]).is("reminder_sent_at", null)
    .gt("starts_at", agora.toISOString()).lt("starts_at", new Date(agora.getTime() + 7 * 86_400_000).toISOString())
    .order("starts_at").limit(LOTE);
  let enviados = 0;
  const erros: string[] = [];
  for (const r of (data ?? []) as unknown as Reuniao[]) {
    const p = await politicaDe(admin, r.org_id);
    if (p.reminder_minutes_before <= 0) continue;
    if (new Date(r.starts_at).getTime() - agora.getTime() > p.reminder_minutes_before * 60_000) continue;
    const resultado = await avisarContato(admin, r, render(p.reminder_text, r), p.reminder_template_name, `Lembrete: ${r.title}`);
    await admin.from("appointments").update({
      reminder_sent_at: agora.toISOString(),
      metadata: { reminder: { ok: resultado.ok, canal: resultado.canal, motivo: resultado.motivo ?? null, at: agora.toISOString() } },
    }).eq("id", r.id);
    if (resultado.ok) enviados++;
    else erros.push(`${r.id}: ${resultado.motivo}`);
  }
  return { enviados, erros };
}

async function noShows(admin: SupabaseClient, agora: Date) {
  const { data } = await admin.from("appointments")
    .select("id, org_id, contact_id, title, starts_at, timezone, status, contacts(first_name, last_name, whatsapp_phone, phone, email)")
    .eq("status", "scheduled").is("no_show_marked_at", null)
    .lt("starts_at", new Date(agora.getTime() - 5 * 60_000).toISOString()).gt("starts_at", new Date(agora.getTime() - 2 * 86_400_000).toISOString())
    .order("starts_at").limit(LOTE);
  let marcados = 0;
  const erros: string[] = [];
  for (const r of (data ?? []) as unknown as Reuniao[]) {
    const p = await politicaDe(admin, r.org_id);
    if (agora.getTime() - new Date(r.starts_at).getTime() < p.no_show_after_minutes * 60_000) continue;
    const { error } = await admin.from("appointments").update({ status: "no_show", no_show_marked_at: agora.toISOString() }).eq("id", r.id).eq("status", "scheduled");
    if (error) { erros.push(`${r.id}: ${error.message}`); continue; }
    marcados++;
    const resultado = await avisarContato(admin, r, render(p.no_show_text, r), p.reminder_template_name, `Sobre a reunião ${r.title}`);
    if (!resultado.ok) erros.push(`${r.id} (aviso): ${resultado.motivo}`);
  }
  return { marcados, erros };
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (!chamadaInterna(req) && !(await cronAutorizado(req, admin))) return naoAutorizado();
  try {
    const agora = new Date();
    const l = await lembretes(admin, agora);
    const n = await noShows(admin, agora);
    return json({ ok: true, lembretes: l.enviados, no_shows: n.marcados, erros: [...l.erros, ...n.erros] });
  } catch (err) {
    console.error("[appointment-dispatcher]", err);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
