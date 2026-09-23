// Entrega de notificações por e-mail e WhatsApp (cron a cada minuto).
//
// `create_notification` (SQL) enfileira em notification_deliveries quando a
// preferência do usuário para o canal está ligada. Aqui cada entrega pendente
// vira um e-mail (provedor da org, _shared/email.ts) ou uma mensagem de
// WhatsApp para o telefone do PRÓPRIO usuário (profiles.phone), pelo canal
// da org: texto no Evolution; template aprovado na Meta e no Zernio.
//
// Texto: notification_templates da org, com padrão em SQL. Variáveis: title,
// body, user.first_name, link (app_url() + rota da entidade).
// Retry: 1 min, 5 min, 30 min; depois `failed` com o motivo.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cronAutorizado, naoAutorizado } from "../_shared/seguranca.ts";
import { enviarEmail } from "../_shared/email.ts";
import { enviarWhatsappOrg } from "../_shared/whatsappOrg.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOTE = 100;
const ESPERA_MIN = [1, 5, 30];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function render(template: string, vars: Record<string, string>): string {
  return (template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
}

/** Só dígitos, com DDI 55 quando faltou. */
function telefone(bruto: string | null | undefined): string | null {
  const d = (bruto ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

/** Mesma tabela de rotas do sino do app. */
function rota(entityType: string | null, entityId: string | null): string {
  if (!entityId) return "/";
  switch (entityType) {
    case "deal": return `/deals/${entityId}`;
    case "contact": return "/contacts";
    case "company": return "/companies";
    case "activity": return "/tasks";
    case "conversation": return `/inbox?conversation=${entityId}`;
    default: return "/";
  }
}

interface Entrega {
  id: string;
  org_id: string;
  notification_id: string;
  user_id: string;
  channel: "email" | "whatsapp";
  attempts: number;
}

interface Modelo {
  email_subject: string;
  email_html: string;
  whatsapp_text: string;
  whatsapp_template_name: string | null;
}

async function modelo(admin: SupabaseClient, orgId: string, evento: string): Promise<Modelo> {
  const { data } = await admin
    .from("notification_templates")
    .select("email_subject, email_html, whatsapp_text, whatsapp_template_name")
    .eq("org_id", orgId).eq("event_type", evento).maybeSingle();
  if (data) return data as Modelo;
  const { data: padrao } = await admin.rpc("notification_template_padrao", { p_event: evento });
  const p = (Array.isArray(padrao) ? padrao[0] : padrao) as Partial<Modelo> | null;
  return {
    email_subject: p?.email_subject ?? "{{title}}",
    email_html: p?.email_html ?? "<p>{{body}}</p>",
    whatsapp_text: p?.whatsapp_text ?? "{{title}}: {{body}}",
    whatsapp_template_name: null,
  };
}

async function processar(admin: SupabaseClient, e: Entrega, appUrl: string): Promise<"sent" | "retry" | "failed"> {
  const { data: n } = await admin
    .from("notifications").select("type, title, body, entity_type, entity_id")
    .eq("id", e.notification_id).maybeSingle();
  if (!n) return "failed";
  const { data: perfil } = await admin.from("profiles").select("full_name, email, phone").eq("id", e.user_id).maybeSingle();
  const vars = {
    title: n.title ?? "",
    body: n.body ?? "",
    "user.first_name": ((perfil?.full_name as string | null) ?? "").split(" ")[0] ?? "",
    link: `${appUrl}${rota(n.entity_type as string | null, n.entity_id as string | null)}`,
  };
  const tpl = await modelo(admin, e.org_id, n.type as string);

  if (e.channel === "email") {
    const destino = (perfil?.email as string | null) ?? "";
    if (!destino) throw new Error("usuário sem e-mail");
    const r = await enviarEmail(admin, {
      orgId: e.org_id, to: destino,
      subject: render(tpl.email_subject, vars), html: render(tpl.email_html, vars), text: `${vars.title}\n${vars.body}\n${vars.link}`,
    });
    if (!r.ok) throw new Error(r.motivo ?? "falha no e-mail");
    return "sent";
  }

  const numero = telefone(perfil?.phone as string | null);
  if (!numero) throw new Error("usuário sem telefone em Configurações > Geral");
  const r = await enviarWhatsappOrg(admin, e.org_id, numero, render(tpl.whatsapp_text, vars), tpl.whatsapp_template_name);
  if (!r.ok) throw new Error(r.motivo ?? "falha no WhatsApp");
  return "sent";
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await cronAutorizado(req, admin))) return naoAutorizado();
  const agora = new Date();

  const { data: appUrlData } = await admin.rpc("app_url");
  const appUrl = (typeof appUrlData === "string" && appUrlData ? appUrlData : "").replace(/\/$/, "");

  const { data: entregas, error } = await admin
    .from("notification_deliveries")
    .select("id, org_id, notification_id, user_id, channel, attempts")
    .eq("status", "pending")
    .lte("scheduled_at", agora.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(LOTE);
  if (error) return json({ error: error.message }, 500);

  const contagem = { sent: 0, retry: 0, failed: 0 };
  for (const e of (entregas ?? []) as Entrega[]) {
    try {
      await processar(admin, e, appUrl);
      await admin.from("notification_deliveries")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: e.attempts + 1, last_error: null })
        .eq("id", e.id);
      contagem.sent++;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      const tentativa = e.attempts + 1;
      const espera = ESPERA_MIN[tentativa - 1];
      if (espera === undefined) {
        await admin.from("notification_deliveries")
          .update({ status: "failed", attempts: tentativa, last_error: motivo })
          .eq("id", e.id);
        contagem.failed++;
      } else {
        await admin.from("notification_deliveries")
          .update({ attempts: tentativa, last_error: motivo, scheduled_at: new Date(Date.now() + espera * 60_000).toISOString() })
          .eq("id", e.id);
        contagem.retry++;
      }
    }
  }
  return json({ ok: true, ...contagem });
});
