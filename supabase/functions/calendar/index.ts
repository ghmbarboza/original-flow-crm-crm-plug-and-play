// Calendário do usuário (Sprint 12 B11): conexão Nylas por usuário, status,
// sincronização de uma reunião e desconexão. Chamada pelo front com sessão.
//
// Ações (POST):
//   connect      { app_origin, api_base? } → URL de autorização do Nylas (volta em calendar-oauth-callback)
//   status       → integração do usuário (sem segredos) e se a org tem credenciais do Nylas
//   update       { sync_enabled?, create_meet? }
//   sync_event   { appointment_id } → espelha no calendário do dono (também usada internamente)
//   disconnect   → apaga o grant no Nylas e a integração
//
// Credenciais do Nylas (client id + api key) são da org, cadastradas pelo admin
// via store-api-key (nylas_client_id, nylas_api_key). api_base só é aceito
// quando aponta a integration-sandbox deste projeto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamadaInterna } from "../_shared/seguranca.ts";
import { origemDoApp } from "../_shared/origem.ts";
import { baseNylas, credenciaisNylas, nylasFetch } from "../_shared/nylas.ts";
import { sincronizarComCalendario } from "../_shared/agenda.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const VALIDADE_ESTADO_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function apiBaseAceita(valor: unknown): string | null {
  const prefixo = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integration-sandbox/`;
  return typeof valor === "string" && valor.startsWith(prefixo) ? valor : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // Chamada interna (dispatcher, webhooks): só sincroniza.
    if (chamadaInterna(req) && action === "sync_event") {
      if (typeof body.appointment_id !== "string") return json({ error: "Informe appointment_id." }, 400);
      await sincronizarComCalendario(admin, body.appointment_id);
      return json({ ok: true });
    }

    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader ? await admin.auth.getUser(authHeader.replace("Bearer ", "")) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: perfil } = await admin.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = perfil?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const cred = await credenciaisNylas(admin, orgId);
    const { data: integracao } = await admin.from("calendar_integrations")
      .select("id, provider, grant_provider, account_email, calendar_id, status, sync_enabled, create_meet, last_synced_at, last_error, api_base, grant_id")
      .eq("user_id", user.id).eq("provider", "nylas").maybeSingle();

    if (action === "status") {
      const { grant_id: _g, api_base: _a, ...publico } = integracao ?? { grant_id: null, api_base: null };
      return json({ ok: true, credentials_ready: !!cred, integration: integracao ? publico : null });
    }

    if (action === "connect") {
      if (!cred) return json({ error: "Cadastre o Client ID e a API Key do Nylas em Configurações > Agenda antes de conectar." }, 400);
      const origem = origemDoApp(body.app_origin) ?? origemDoApp(req.headers.get("Origin"));
      if (!origem) return json({ error: "Não foi possível identificar o endereço do app. Recarregue a página e tente de novo." }, 400);
      const apiBase = apiBaseAceita(body.api_base);
      const state = crypto.randomUUID().replace(/-/g, "");
      await admin.from("calendar_oauth_states").delete().lt("created_at", new Date(Date.now() - VALIDADE_ESTADO_MS).toISOString());
      const { error } = await admin.from("calendar_oauth_states").insert({ state, org_id: orgId, user_id: user.id, app_origin: origem, api_base: apiBase });
      if (error) return json({ error: error.message }, 500);
      const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/calendar-oauth-callback`;
      const url = new URL(`${baseNylas(apiBase)}/v3/connect/auth`);
      url.searchParams.set("client_id", cred.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("state", state);
      if (user.email) url.searchParams.set("login_hint", user.email);
      return json({ ok: true, url: url.toString(), state });
    }

    if (!integracao) return json({ error: "Nenhum calendário conectado." }, 404);

    if (action === "update") {
      const campos: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.sync_enabled === "boolean") campos.sync_enabled = body.sync_enabled;
      if (typeof body.create_meet === "boolean") campos.create_meet = body.create_meet;
      const { error } = await admin.from("calendar_integrations").update(campos).eq("id", integracao.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "sync_event") {
      if (typeof body.appointment_id !== "string") return json({ error: "Informe appointment_id." }, 400);
      const { data: ap } = await admin.from("appointments").select("id").eq("id", body.appointment_id).eq("org_id", orgId).maybeSingle();
      if (!ap) return json({ error: "Reunião não encontrada." }, 404);
      await sincronizarComCalendario(admin, ap.id);
      const { data: depois } = await admin.from("appointments").select("calendar_sync_status, calendar_sync_error, meeting_url").eq("id", ap.id).maybeSingle();
      return json({ ok: true, ...depois });
    }

    if (action === "disconnect") {
      if (cred) {
        try {
          await nylasFetch(cred.apiKey, `${baseNylas(integracao.api_base as string | null)}/v3/grants/${integracao.grant_id}`, { method: "DELETE" });
        } catch (e) {
          console.error("[calendar] apagar grant falhou:", e instanceof Error ? e.message : e);
        }
      }
      await admin.from("calendar_integrations").delete().eq("id", integracao.id);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
