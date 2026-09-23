// Volta do OAuth do Salesforce (Sprint 12 B9).
//
// O Salesforce redireciona para cá com ?code&state. O state foi gravado em
// crm_oauth_states pela crm-connect (uso único, 15 min). Trocamos o code por
// tokens, guardamos refresh_token + instance_url no Vault, criamos a conexão
// lendo a estrutura e devolvemos o usuário para Configurações > Importação.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SALESFORCE_LOGIN, adaptadorDe, tokenSalesforce } from "../_shared/crm/index.ts";

const VALIDADE_ESTADO_MS = 15 * 60 * 1000;
const DESTINO = "/settings/importacao?secao=crm";

function voltar(appUrl: string | null, query: string) {
  if (!appUrl) {
    return new Response(
      "<meta charset=utf-8><p>Não foi possível voltar ao app automaticamente. Feche esta aba, volte ao FlowCRM e tente conectar de novo.</p>",
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  return new Response(null, { status: 302, headers: { Location: `${appUrl}${DESTINO}&${query}` } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: estado } = state
    ? await admin.from("crm_oauth_states").select("state, org_id, user_id, app_origin, login_base, created_at").eq("state", state).maybeSingle()
    : { data: null };
  if (estado) await admin.from("crm_oauth_states").delete().eq("state", state);
  const appUrl = (estado?.app_origin as string | null) ?? null;
  if (!estado || Date.now() - new Date(estado.created_at as string).getTime() > VALIDADE_ESTADO_MS) return voltar(appUrl, "crm_error=estado_invalido");
  if (!code) return voltar(appUrl, `crm_error=${encodeURIComponent(url.searchParams.get("error_description") ?? "sem_code")}`);

  try {
    const orgId = estado.org_id as string;
    const ler = async (servico: string) => {
      const { data } = await admin.rpc("get_org_api_key", { _org_id: orgId, _service: servico });
      return typeof data === "string" ? data.trim() : "";
    };
    const clientId = await ler("salesforce_client_id");
    const clientSecret = await ler("salesforce_client_secret");
    if (!clientId || !clientSecret) return voltar(appUrl, "crm_error=sem_credencial");

    // A base do login só pode vir do registro gravado pela crm-connect (que já a
    // restringiu à integration-sandbox), nunca da URL de volta.
    const sandboxPrefixo = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integration-sandbox/`;
    const loginBaseGravada = typeof estado.login_base === "string" ? estado.login_base : "";
    const loginBase = loginBaseGravada.startsWith(sandboxPrefixo) ? loginBaseGravada : SALESFORCE_LOGIN;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-oauth-callback`;
    const tokens = await tokenSalesforce(loginBase, { grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri });
    if (!tokens.refresh_token) return voltar(appUrl, "crm_error=sem_refresh_token");

    // Sandbox: a API fica no mesmo endereço do login falso.
    const apiBase = loginBase === SALESFORCE_LOGIN ? null : loginBase;
    const cred = { token: tokens.access_token, domain: tokens.instance_url, apiBase };
    const estrutura = await adaptadorDe("salesforce")!.lerEstrutura(cred);
    const segredo = JSON.stringify({ refresh_token: tokens.refresh_token, instance_url: tokens.instance_url, ...(apiBase ? { login_base: loginBase } : {}) });
    const { data: secretId, error: errSegredo } = await admin.rpc("create_secret", {
      new_secret: segredo, new_name: `crm_salesforce_${orgId}_${crypto.randomUUID().slice(0, 8)}`, new_description: "Conexão Salesforce",
    });
    if (errSegredo || !secretId) return voltar(appUrl, "crm_error=vault");

    // Trocar a conexão: o trigger do banco apaga o segredo antigo do Vault.
    await admin.from("crm_connections").delete().eq("org_id", orgId).eq("provider", "salesforce");
    const { error } = await admin.from("crm_connections").insert({
      org_id: orgId, provider: "salesforce", auth_type: "oauth", vault_secret_id: secretId, account_domain: tokens.instance_url, api_base: apiBase,
      status: "connected", structure: estrutura, created_by: estado.user_id ?? null,
    });
    if (error) return voltar(appUrl, `crm_error=${encodeURIComponent(error.message)}`);
    return voltar(appUrl, "crm_connected=salesforce");
  } catch (e) {
    return voltar(appUrl, `crm_error=${encodeURIComponent(e instanceof Error ? e.message : "erro")}`);
  }
});
