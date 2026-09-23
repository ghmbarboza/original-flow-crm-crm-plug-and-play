// Dispatcher das sequências de e-mail (cron a cada 15 min).
//
// Antes deste sprint as inscrições em `email_sequence_enrollments` eram
// criadas (automação start_sequence, tela de Sequências) mas nada as
// processava. Aqui cada inscrição ativa avança um passo quando o atraso do
// passo venceu: envia o modelo do passo pelo provedor da org e marca
// `current_step`/`last_sent_at`; sem mais passos, conclui.
//
// Segurança: só o cron chama, com o segredo interno (ver _shared/seguranca.ts).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cronAutorizado, naoAutorizado } from "../_shared/seguranca.ts";
import { enviarEmail } from "../_shared/email.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOTE = 200;
const DIA_MS = 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** {{contact.first_name}}, {{contact.email}}, {{company.name}}... contra um contexto aninhado. */
function render(template: string, ctx: Record<string, Record<string, unknown> | null>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const [root, field] = path.split(".");
    const v = ctx[root]?.[field];
    return v === undefined || v === null ? "" : String(v);
  });
}

interface Inscricao {
  id: string;
  org_id: string;
  sequence_id: string;
  contact_id: string;
  current_step: number;
  enrolled_at: string;
  last_sent_at: string | null;
}

interface Passo {
  id: string;
  template_id: string | null;
  delay_days: number;
  order: number;
}

async function processar(admin: SupabaseClient, insc: Inscricao, agora: Date): Promise<"sent" | "waiting" | "completed" | "failed"> {
  const { data: passos } = await admin
    .from("email_sequence_steps")
    .select("id, template_id, delay_days, order")
    .eq("sequence_id", insc.sequence_id)
    .order("order", { ascending: true });
  const lista = (passos ?? []) as Passo[];
  const passo = lista[insc.current_step];
  if (!passo) {
    await admin.from("email_sequence_enrollments")
      .update({ status: "completed", completed_at: agora.toISOString() })
      .eq("id", insc.id);
    return "completed";
  }

  const base = new Date(insc.last_sent_at ?? insc.enrolled_at).getTime();
  if (base + Number(passo.delay_days ?? 0) * DIA_MS > agora.getTime()) return "waiting";

  const { data: contato } = await admin
    .from("contacts")
    .select("id, first_name, last_name, email, title, company_id, merged_into_id")
    .eq("id", insc.contact_id)
    .maybeSingle();
  if (!contato?.email || contato.merged_into_id) {
    await admin.from("email_sequence_enrollments")
      .update({ status: "stopped", completed_at: agora.toISOString() })
      .eq("id", insc.id);
    return "failed";
  }

  const { data: tpl } = passo.template_id
    ? await admin.from("email_templates").select("subject, body_html").eq("id", passo.template_id).maybeSingle()
    : { data: null };
  if (!tpl) {
    // Passo sem modelo: pula sem travar a régua.
    await admin.from("email_sequence_enrollments")
      .update({ current_step: insc.current_step + 1, last_sent_at: agora.toISOString() })
      .eq("id", insc.id);
    return "sent";
  }

  let company: Record<string, unknown> | null = null;
  if (contato.company_id) {
    const { data } = await admin.from("companies").select("name").eq("id", contato.company_id).maybeSingle();
    company = data ?? null;
  }
  const ctx = { contact: contato as Record<string, unknown>, company };
  const resultado = await enviarEmail(admin, {
    orgId: insc.org_id,
    to: contato.email as string,
    subject: render(String(tpl.subject ?? ""), ctx),
    html: render(String(tpl.body_html ?? ""), ctx),
    contactId: contato.id as string,
  });
  if (!resultado.ok) {
    console.error(`[sequence] inscrição ${insc.id} passo ${insc.current_step}: ${resultado.motivo}`);
    return "failed";
  }

  const proximo = insc.current_step + 1;
  const acabou = proximo >= lista.length;
  await admin.from("email_sequence_enrollments")
    .update({
      current_step: proximo,
      last_sent_at: agora.toISOString(),
      ...(acabou ? { status: "completed", completed_at: agora.toISOString() } : {}),
    })
    .eq("id", insc.id);
  return acabou ? "completed" : "sent";
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await cronAutorizado(req, admin))) return naoAutorizado();
  const agora = new Date();

  const { data: inscricoes, error } = await admin
    .from("email_sequence_enrollments")
    .select("id, org_id, sequence_id, contact_id, current_step, enrolled_at, last_sent_at, sequence:email_sequences!inner(is_active)")
    .eq("status", "active")
    .eq("sequence.is_active", true)
    .order("enrolled_at", { ascending: true })
    .limit(LOTE);
  if (error) return json({ error: error.message }, 500);

  const contagem = { sent: 0, waiting: 0, completed: 0, failed: 0 };
  for (const insc of (inscricoes ?? []) as unknown as Inscricao[]) {
    try {
      contagem[await processar(admin, insc, agora)]++;
    } catch (e) {
      contagem.failed++;
      console.error(`[sequence] inscrição ${insc.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return json({ ok: true, ...contagem });
});
