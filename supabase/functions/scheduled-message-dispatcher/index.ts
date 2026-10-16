// Dispatcher de mensagens programadas (executar por cron, ex.: a cada 5 min).
//
// Busca scheduled_messages pendentes e vencidas, resolve a conversa do contato
// (a gravada na linha ou, sem ela, a mais recente não-encerrada), renderiza as
// variáveis com dados frescos do contato e envia pelo provedor da conversa
// (evolution/meta/zernio). Marca sent/failed — falha fica dita em error_msg,
// nunca engolida.
//
// Segurança: só o cron chama, com o segredo interno (ver _shared/seguranca.ts).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cronAutorizado, naoAutorizado } from "../_shared/seguranca.ts";
import { contaDaConversa, enviarTextoPelaConta } from "../_shared/canal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Variáveis {{chave}} (com ponto) resolvidas; sem valor vira vazio. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

// Tipar pela instância: `ReturnType<typeof createClient>` resolve os genéricos
// como `never` e recusa o cliente real no `deno check`.
type Admin = SupabaseClient;

interface Conversa {
  id: string;
  provider: string;
  channel: string;
  phone_number: string;
  provider_conversation_id: string | null;
  channel_account_id: string | null;
}

const COLUNAS_CONVERSA = "id, provider, channel, phone_number, provider_conversation_id, channel_account_id";

/**
 * Envia texto pela conta (número) em que a conversa entrou (ver _shared/canal.ts).
 * Devolve o motivo em caso de falha.
 */
async function enviar(
  admin: Admin,
  orgId: string,
  conv: Conversa,
  text: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const conta = await contaDaConversa(admin, { org_id: orgId, ...conv });
  if (!conta) return { ok: false, motivo: `Nenhuma conta ativa do provedor ${conv.provider}` };
  const envio = await enviarTextoPelaConta(conta, conv, text);
  return envio.ok ? { ok: true } : { ok: false, motivo: envio.motivo };
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await cronAutorizado(req, admin))) return naoAutorizado();
  const now = new Date().toISOString();
  let sent = 0;
  let failed = 0;

  // Lote limitado: com cron de 5 min, um backlog gigante não trava a execução.
  const { data: pendentes, error } = await admin
    .from("scheduled_messages")
    .select("id, org_id, contact_id, conversation_id, message")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(50);
  if (error) return json({ error: error.message }, 500);

  for (const msg of pendentes ?? []) {
    const falhar = async (motivo: string) => {
      await admin.from("scheduled_messages")
        .update({ status: "failed", error_msg: motivo })
        .eq("id", msg.id);
      failed++;
    };

    // Conversa: a gravada na linha, senão a mais recente não-encerrada do contato.
    let conv: Conversa | null = null;
    if (msg.conversation_id) {
      const { data } = await admin
        .from("conversations")
        .select(`${COLUNAS_CONVERSA}, status, is_demo`)
        .eq("id", msg.conversation_id).maybeSingle();
      // Trava da demo: conversa semeada nunca recebe envio agendado real.
      if (data && data.status !== "closed" && data.is_demo !== true) conv = data as unknown as Conversa;
    }
    if (!conv) {
      const { data } = await admin
        .from("conversations")
        .select(COLUNAS_CONVERSA)
        .eq("contact_id", msg.contact_id)
        .neq("status", "closed")
        .eq("is_demo", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();
      conv = (data as unknown as Conversa) ?? null;
    }
    if (!conv) {
      await falhar("Contato sem conversa ativa para receber a mensagem");
      continue;
    }

    const { data: contact } = await admin
      .from("contacts")
      .select("first_name, last_name")
      .eq("id", msg.contact_id).maybeSingle();
    const first = (contact?.first_name as string) ?? "";
    const last = (contact?.last_name as string) ?? "";
    const text = render(msg.message as string, {
      "contact.first_name": first,
      "contact.last_name": last,
      "contact.name": [first, last].filter(Boolean).join(" "),
    });

    const resultado = await enviar(admin, msg.org_id as string, conv, text);
    if (!resultado.ok) {
      await falhar(resultado.motivo ?? "Falha no envio");
      continue;
    }

    // Registra no histórico da conversa, como followup e zernio-send fazem —
    // o agente vê a mensagem programada no chat como qualquer outra.
    await admin.from("conversation_messages").insert({
      conversation_id: conv.id, org_id: msg.org_id, direction: "outbound",
      content: text, type: "text", status: "sent",
      // Sem esta referência a mensagem fica idêntica a uma digitada agora, e
      // ninguém que abre a conversa sabe que o envio foi programado.
      scheduled_message_id: msg.id,
    });
    await admin.from("conversations").update({
      last_message_at: now, last_message_preview: text.slice(0, 120),
    }).eq("id", conv.id);
    await admin.from("scheduled_messages")
      .update({ status: "sent", sent_at: now, error_msg: null })
      .eq("id", msg.id);
    sent++;
  }

  return json({ processed: (pendentes ?? []).length, sent, failed });
});
