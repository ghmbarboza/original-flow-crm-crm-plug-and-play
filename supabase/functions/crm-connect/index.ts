// Conectores com outros CRMs (Sprint 12 B9).
//
// Ações (POST, sessão de usuário admin da organização):
//   connect      { provider, token, domain?, label?, api_base? } → valida lendo a
//                estrutura, guarda o token no Vault e cria a conexão.
//   structure    { connection_id } → relê funis, etapas, campos e contagens.
//   sync         { connection_id, kind, stage_map?, cursor?, import_id? } →
//                puxa páginas do CRM e grava pelo mesmo núcleo do CSV
//                (_shared/importar.ts). Devolve next_cursor; o front chama de
//                novo até acabar. Cada chamada processa até PAGINAS_POR_CHAMADA.
//   disconnect   { connection_id } → apaga a conexão e o segredo.
//   oauth_start  { provider: "salesforce", app_origin, api_base? } → URL de
//                autorização; a volta é a function crm-oauth-callback.
//
// Só admin conecta, sincroniza e desconecta. O token nunca volta para o front.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { importarLote, novoCtx } from "../_shared/importar.ts";
import {
  ENTIDADES, ErroCrm, PROVEDORES, SALESFORCE_LOGIN, adaptadorDe, tokenSalesforce,
  type CredencialCrm, type EntidadeCrm, type EstruturaCrm, type ProvedorCrm,
} from "../_shared/crm/index.ts";
import { origemDoApp } from "../_shared/origem.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PAGINAS_POR_CHAMADA = 5;
const VALIDADE_ESTADO_MS = 15 * 60 * 1000;

/** api_base só é aceito quando aponta a integration-sandbox deste projeto (hard smoke). */
function apiBaseAceita(valor: unknown): string | null {
  const prefixo = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integration-sandbox/`;
  return typeof valor === "string" && valor.startsWith(prefixo) ? valor : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface Conexao {
  id: string; org_id: string; provider: ProvedorCrm; auth_type: string; vault_secret_id: string | null; account_domain: string | null;
  api_base: string | null; structure: EstruturaCrm; stage_map: Record<string, string>; status: string;
}

async function credencialDe(admin: SupabaseClient, conexao: Conexao): Promise<CredencialCrm> {
  const { data: segredo, error } = await admin.rpc("segredo_conexao_crm", { p_connection: conexao.id });
  if (error || typeof segredo !== "string" || !segredo) throw new ErroCrm(500, "Segredo da conexão não encontrado. Conecte de novo.");
  if (conexao.provider === "salesforce") {
    // Segredo = JSON { refresh_token, instance_url, login_base? }: renovamos o access token a cada uso.
    const dados = JSON.parse(segredo) as { refresh_token: string; instance_url: string; login_base?: string };
    const cred = await credenciaisSalesforce(admin, conexao.org_id);
    const tokens = await tokenSalesforce(dados.login_base ?? SALESFORCE_LOGIN, {
      grant_type: "refresh_token", client_id: cred.clientId, client_secret: cred.clientSecret, refresh_token: dados.refresh_token,
    });
    return { token: tokens.access_token, domain: tokens.instance_url || dados.instance_url, apiBase: conexao.api_base };
  }
  return { token: segredo, domain: conexao.account_domain, apiBase: conexao.api_base };
}

async function credenciaisSalesforce(admin: SupabaseClient, orgId: string) {
  const ler = async (servico: string) => {
    const { data } = await admin.rpc("get_org_api_key", { _org_id: orgId, _service: servico });
    return typeof data === "string" ? data.trim() : "";
  };
  const clientId = await ler("salesforce_client_id");
  const clientSecret = await ler("salesforce_client_secret");
  if (!clientId || !clientSecret) throw new ErroCrm(400, "Cadastre o Consumer Key e o Consumer Secret do Connected App do Salesforce antes de conectar.");
  return { clientId, clientSecret };
}

async function guardarSegredo(admin: SupabaseClient, orgId: string, provider: string, valor: string): Promise<string> {
  const { data, error } = await admin.rpc("create_secret", {
    new_secret: valor, new_name: `crm_${provider}_${orgId}_${crypto.randomUUID().slice(0, 8)}`, new_description: `Conexão ${provider}`,
  });
  if (error || !data) throw new ErroCrm(500, `Falha ao guardar o segredo: ${error?.message ?? "sem id"}`);
  return data as string;
}

/** Cria a conexão (ou substitui a do mesmo provedor) depois de ler a estrutura. */
export async function criarConexao(
  admin: SupabaseClient, orgId: string, userId: string | null,
  input: { provider: ProvedorCrm; auth_type: "token" | "oauth"; segredo: string; cred: CredencialCrm; label?: string | null; api_base?: string | null },
) {
  const adaptador = adaptadorDe(input.provider)!;
  const estrutura = await adaptador.lerEstrutura(input.cred);
  const secretId = await guardarSegredo(admin, orgId, input.provider, input.segredo);
  // Trocar a conexão do mesmo provedor: o trigger do banco apaga o segredo antigo do Vault.
  await admin.from("crm_connections").delete().eq("org_id", orgId).eq("provider", input.provider);
  const { data: conexao, error } = await admin.from("crm_connections").insert({
    org_id: orgId, provider: input.provider, auth_type: input.auth_type, label: input.label ?? null, vault_secret_id: secretId,
    account_domain: input.cred.domain ?? estrutura.account ?? null, api_base: input.api_base ?? null, status: "connected",
    structure: estrutura, created_by: userId,
  }).select("id, provider, account_domain, structure, status").single();
  if (error || !conexao) throw new ErroCrm(500, error?.message ?? "Falha ao gravar a conexão.");
  return conexao;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader ? await admin.auth.getUser(authHeader.replace("Bearer ", "")) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: perfil } = await admin.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = perfil?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);
    const { data: ehAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!ehAdmin) return json({ error: "Apenas administradores conectam outros CRMs." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "connect") {
      const provider = String(body.provider ?? "") as ProvedorCrm;
      if (!PROVEDORES.includes(provider) || provider === "salesforce") return json({ error: "Provedor inválido para conexão por token." }, 400);
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (!token) return json({ error: "Informe o token da API." }, 400);
      const domain = typeof body.domain === "string" && body.domain.trim() ? body.domain.trim().replace(/^https?:\/\//, "").replace(/\..*$/, "") : null;
      const apiBase = apiBaseAceita(body.api_base);
      if ((provider === "pipedrive" || provider === "kommo") && !domain && !apiBase) return json({ error: "Informe o subdomínio da sua conta." }, 400);
      const conexao = await criarConexao(admin, orgId, user.id, {
        provider, auth_type: "token", segredo: token, cred: { token, domain, apiBase }, label: typeof body.label === "string" ? body.label : null, api_base: apiBase,
      });
      return json({ ok: true, connection: conexao });
    }

    if (action === "oauth_start") {
      if (body.provider !== "salesforce") return json({ error: "Só o Salesforce usa OAuth." }, 400);
      const origem = origemDoApp(body.app_origin) ?? origemDoApp(req.headers.get("Origin"));
      if (!origem) return json({ error: "Não foi possível identificar o endereço do app. Recarregue a página e tente de novo." }, 400);
      const cred = await credenciaisSalesforce(admin, orgId);
      const loginBase = apiBaseAceita(body.api_base) ?? SALESFORCE_LOGIN;
      const state = crypto.randomUUID().replace(/-/g, "");
      await admin.from("crm_oauth_states").delete().lt("created_at", new Date(Date.now() - VALIDADE_ESTADO_MS).toISOString());
      const { error } = await admin.from("crm_oauth_states").insert({ state, org_id: orgId, provider: "salesforce", user_id: user.id, app_origin: origem });
      if (error) return json({ error: error.message }, 500);
      const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-oauth-callback`;
      const url = new URL(`${loginBase}/services/oauth2/authorize`);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", cred.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", loginBase === SALESFORCE_LOGIN ? state : `${state}.${btoa(loginBase)}`);
      url.searchParams.set("scope", "api refresh_token");
      return json({ ok: true, url: url.toString(), state });
    }

    const connectionId = typeof body.connection_id === "string" ? body.connection_id : "";
    if (!connectionId) return json({ error: "Informe connection_id." }, 400);
    const { data: conexao } = await admin.from("crm_connections").select("*").eq("id", connectionId).eq("org_id", orgId).maybeSingle();
    if (!conexao) return json({ error: "Conexão não encontrada." }, 404);
    const cx = conexao as Conexao;

    if (action === "disconnect") {
      await admin.from("crm_connections").delete().eq("id", cx.id);
      return json({ ok: true });
    }

    if (action === "structure") {
      const cred = await credencialDe(admin, cx);
      const estrutura = await adaptadorDe(cx.provider)!.lerEstrutura(cred);
      await admin.from("crm_connections").update({ structure: estrutura, status: "connected", last_error: null, updated_at: new Date().toISOString() }).eq("id", cx.id);
      return json({ ok: true, structure: estrutura });
    }

    if (action === "sync") {
      const kind = String(body.kind ?? "") as EntidadeCrm;
      if (!ENTIDADES.includes(kind)) return json({ error: "kind deve ser contacts, companies ou deals." }, 400);
      const stageMap = (body.stage_map && typeof body.stage_map === "object" ? body.stage_map : cx.stage_map ?? {}) as Record<string, string>;
      let cursor: string | null = typeof body.cursor === "string" && body.cursor ? body.cursor : null;
      let importId = typeof body.import_id === "string" ? body.import_id : "";
      let linhaBase = Number(body.row_offset) || 0;
      if (!importId) {
        const { data: imp, error } = await admin.from("imports").insert({
          org_id: orgId, kind, source: cx.provider, file_name: `${cx.provider}:${kind}`, status: "processing", connection_id: cx.id,
          mapping: { stages: stageMap, provider: cx.provider }, created_by: user.id,
        }).select("id").single();
        if (error || !imp) return json({ error: error?.message ?? "Falha ao abrir a importação." }, 500);
        importId = imp.id;
        await admin.from("crm_connections").update({ stage_map: stageMap }).eq("id", cx.id);
      }
      const cred = await credencialDe(admin, cx);
      const adaptador = adaptadorDe(cx.provider)!;
      const ctx = novoCtx(admin, orgId, importId, kind, stageMap);
      const total = { created: 0, updated: 0, skipped: 0, error: 0 };
      const erros: { row_number: number; error: string }[] = [];
      let paginas = 0;
      try {
        do {
          const pagina = await adaptador.listar(cred, kind, cursor, cx.structure);
          const lote = pagina.rows.map((data, i) => ({ row_number: linhaBase + i + 1, data }));
          linhaBase += pagina.rows.length;
          const r = await importarLote(ctx, lote);
          total.created += r.created; total.updated += r.updated; total.skipped += r.skipped; total.error += r.error;
          for (const x of r.results) if (x.status === "error") erros.push({ row_number: x.row_number, error: x.error ?? "erro" });
          cursor = pagina.next;
          paginas++;
        } while (cursor && paginas < PAGINAS_POR_CHAMADA);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("imports").update({ status: "failed", error_report: msg }).eq("id", importId);
        await admin.from("crm_connections").update({ status: "error", last_error: msg }).eq("id", cx.id);
        return json({ error: msg, import_id: importId }, e instanceof ErroCrm ? 502 : 500);
      }
      const { data: atual } = await admin.from("imports").select("stats, error_report").eq("id", importId).single();
      const stats = (atual?.stats ?? {}) as Record<string, number>;
      const acumulado = {
        total: (stats.total ?? 0) + linhaBase - (Number(body.row_offset) || 0),
        created: (stats.created ?? 0) + total.created, updated: (stats.updated ?? 0) + total.updated,
        skipped: (stats.skipped ?? 0) + total.skipped, error: (stats.error ?? 0) + total.error,
      };
      const relatorio = [atual?.error_report ?? (erros.length ? "linha;erro" : ""), ...erros.map((e) => `${e.row_number};${e.error.replace(/;/g, ",")}`)].filter(Boolean).join("\n") || null;
      const terminou = !cursor;
      await admin.from("imports").update({
        stats: acumulado, error_report: relatorio, ...(terminou ? { status: "completed", completed_at: new Date().toISOString() } : {}),
      }).eq("id", importId);
      if (terminou) await admin.from("crm_connections").update({ last_sync_at: new Date().toISOString(), status: "connected", last_error: null }).eq("id", cx.id);
      return json({ ok: true, import_id: importId, next_cursor: cursor, row_offset: linhaBase, done: terminou, ...acumulado, errors: erros.slice(0, 50) });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (err) {
    const status = err instanceof ErroCrm ? (err.status >= 400 && err.status < 500 ? err.status : 502) : 500;
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, status);
  }
});
