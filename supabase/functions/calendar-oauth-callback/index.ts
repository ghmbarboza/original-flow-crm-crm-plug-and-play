// Volta do OAuth hospedado do Nylas (Sprint 12 B11). O state foi gravado pela
// function calendar (uso único, 10 min) com a org, o usuário e a origem do app.
// Troca o code por um grant, grava calendar_integrations e devolve o usuário
// para Configurações > Agenda.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { credenciaisNylas, trocarCode } from "../_shared/nylas.ts";

const VALIDADE_ESTADO_MS = 10 * 60 * 1000;
const DESTINO = "/settings/agenda";

function voltar(appUrl: string | null, query: string) {
  if (!appUrl) {
    return new Response(
      "<meta charset=utf-8><p>Não foi possível voltar ao app automaticamente. Feche esta aba, volte ao FlowCRM e tente conectar de novo.</p>",
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  return new Response(null, { status: 302, headers: { Location: `${appUrl}${DESTINO}?${query}` } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: estado } = state
    ? await admin.from("calendar_oauth_states").select("state, org_id, user_id, app_origin, api_base, created_at").eq("state", state).maybeSingle()
    : { data: null };
  if (estado) await admin.from("calendar_oauth_states").delete().eq("state", state);
  const appUrl = (estado?.app_origin as string | null) ?? null;
  if (!estado || Date.now() - new Date(estado.created_at as string).getTime() > VALIDADE_ESTADO_MS) return voltar(appUrl, "calendar_error=estado_invalido");
  if (!code) return voltar(appUrl, `calendar_error=${encodeURIComponent(url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "sem_code")}`);

  try {
    const orgId = estado.org_id as string;
    const cred = await credenciaisNylas(admin, orgId);
    if (!cred) return voltar(appUrl, "calendar_error=sem_credencial");
    const sandboxPrefixo = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integration-sandbox/`;
    const apiBase = typeof estado.api_base === "string" && estado.api_base.startsWith(sandboxPrefixo) ? estado.api_base : null;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/calendar-oauth-callback`;
    const grant = await trocarCode(cred, apiBase, code, redirectUri);

    const { error } = await admin.from("calendar_integrations").upsert({
      org_id: orgId, user_id: estado.user_id as string, provider: "nylas", grant_id: grant.grantId, grant_provider: grant.provider,
      account_email: grant.email, status: "connected", api_base: apiBase, last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (error) return voltar(appUrl, `calendar_error=${encodeURIComponent(error.message)}`);
    return voltar(appUrl, "calendar_connected=nylas");
  } catch (e) {
    return voltar(appUrl, `calendar_error=${encodeURIComponent(e instanceof Error ? e.message : "erro")}`);
  }
});
