// Entrega de eventos ERP de saída (Parte 2 do Sprint 10B).
//
// Os triggers de banco enfileiram eventos habilitados como linhas PENDENTES em
// erp_webhook_logs (payload canônico "entidade.campo"). Este dispatcher, rodado
// por cron a cada minuto, aplica o mapeamento de campos e a autenticação da
// org e entrega na URL configurada, marcando success/failed no próprio log.
//
// Também atende o botão "Testar" da tela de configuração: POST com
// { test: true } e o JWT do usuário — valida que é admin da org e envia um
// payload de teste imediato para a URL configurada.
//
// Proteção do cron: se ERP_CRON_SECRET estiver configurado, o header
// x-cron-secret é exigido no caminho de fila (mesmo padrão do followup).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface ErpConfig {
  org_id: string;
  outbound_url: string | null;
  outbound_auth_type: string;
  outbound_auth_config: Record<string, string> | null;
  outbound_field_mappings: Record<string, Record<string, string>> | null;
  is_active: boolean;
}

/** Headers de autenticação conforme o tipo configurado. */
function authHeaders(config: ErpConfig): Record<string, string> {
  const auth = config.outbound_auth_config ?? {};
  switch (config.outbound_auth_type) {
    case "bearer":
      return auth.token ? { Authorization: `Bearer ${auth.token}` } : {};
    case "basic":
      return auth.username !== undefined
        ? { Authorization: `Basic ${btoa(`${auth.username ?? ""}:${auth.password ?? ""}`)}` }
        : {};
    case "api_key":
      return auth.header && auth.token ? { [auth.header]: auth.token } : {};
    default:
      return {};
  }
}

/**
 * Aplica o mapeamento do evento: cada chave canônica configurada vira o campo
 * com o nome do ERP. Sem mapeamento para o evento, o payload canônico segue
 * como está — integração funciona antes de qualquer configuração fina.
 */
function mapPayload(
  event: string,
  payload: Record<string, unknown>,
  mappings: ErpConfig["outbound_field_mappings"],
): Record<string, unknown> {
  const mapping = mappings?.[event];
  if (!mapping || Object.keys(mapping).length === 0) return { event, ...payload };

  const out: Record<string, unknown> = { event };
  for (const [canonical, erpField] of Object.entries(mapping)) {
    if (erpField && payload[canonical] !== undefined) out[erpField] = payload[canonical];
  }
  return out;
}

async function deliver(config: ErpConfig, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const resp = await fetch(config.outbound_url!, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(config) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "falha de rede" };
  }
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));

  // --- Caminho de teste (tela de configuração) ---------------------------
  if (body?.test === true) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Não autorizado." }, 401);
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Não autorizado." }, 401);

    const { data: profile } = await admin.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    const { data: role } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!profile?.org_id || !role) return json({ error: "Apenas administradores." }, 403);

    const { data: config } = await admin
      .from("erp_integration_configs").select("*").eq("org_id", profile.org_id).maybeSingle();
    if (!config?.outbound_url) return json({ error: "Configure a URL de destino antes de testar." }, 400);

    const result = await deliver(config as ErpConfig, {
      event: "teste_flowcrm",
      mensagem: "Conexão do FlowCRM verificada com sucesso.",
      enviado_em: new Date().toISOString(),
    });
    await admin.from("erp_webhook_logs").insert({
      org_id: profile.org_id,
      direction: "outbound",
      event_type: "teste_flowcrm",
      payload: { event: "teste_flowcrm" },
      status: result.ok ? "success" : "failed",
      error_msg: result.error ?? null,
    });
    return json(result.ok ? { ok: true } : { error: `O destino não aceitou: ${result.error}` }, result.ok ? 200 : 502);
  }

  // --- Caminho de fila (cron) --------------------------------------------
  const secret = Deno.env.get("ERP_CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "Não autorizado" }, 401);
  }

  const { data: pending } = await admin
    .from("erp_webhook_logs")
    .select("id, org_id, event_type, payload")
    .eq("direction", "outbound")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (!pending || pending.length === 0) return json({ ok: true, sent: 0 });

  // Uma leitura de config por org, não por evento.
  const orgIds = [...new Set(pending.map((p) => p.org_id))];
  const { data: configs } = await admin
    .from("erp_integration_configs")
    .select("*")
    .in("org_id", orgIds);
  const configByOrg = new Map((configs ?? []).map((c) => [c.org_id, c as ErpConfig]));

  let sent = 0;
  let failed = 0;
  for (const item of pending) {
    const config = configByOrg.get(item.org_id);
    if (!config?.is_active || !config.outbound_url) {
      await admin.from("erp_webhook_logs")
        .update({ status: "failed", error_msg: "integração inativa ou sem URL" })
        .eq("id", item.id);
      failed++;
      continue;
    }

    const mapped = mapPayload(
      item.event_type,
      (item.payload ?? {}) as Record<string, unknown>,
      config.outbound_field_mappings,
    );
    const result = await deliver(config, mapped);

    await admin.from("erp_webhook_logs")
      .update({ status: result.ok ? "success" : "failed", error_msg: result.error ?? null })
      .eq("id", item.id);

    if (result.ok) {
      sent++;
      await admin.from("erp_integration_configs")
        .update({ last_outbound_at: new Date().toISOString() })
        .eq("org_id", item.org_id);
    } else {
      failed++;
    }
  }

  return json({ ok: true, sent, failed });
});
