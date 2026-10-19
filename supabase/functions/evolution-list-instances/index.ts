// Lista as instâncias existentes de um servidor Evolution para o wizard de conexão.
//
// Recebe as credenciais informadas pelo usuário no wizard (server_url + api_key),
// consulta `GET /instance/fetchInstances` e devolve uma lista enxuta com nome e
// estado de conexão. Nada é persistido aqui — a escolha da instância é que grava.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { falhaDeAlcance, mensagemServidorInalcancavel } from "../_shared/evolutionAlcance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ERRO_CHAVE_RECUSADA =
  "O servidor Evolution recusou a API Key (401). Use a chave GLOBAL do servidor — a mesma que " +
  "abre o /manager, definida em AUTHENTICATION_API_KEY — e não a chave de uma instância. " +
  "Se você trocou de servidor, a chave também muda.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface InstanceSummary {
  instance_name: string;
  state: string;
  profile_name: string | null;
  phone_number: string | null;
}

/**
 * A v2 devolve tanto `[{ instance: {...} }]` quanto `[{ name, connectionStatus }]`
 * dependendo da versão do servidor — normalizamos os dois formatos.
 */
function normalizar(raw: unknown): InstanceSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const node = (item as Record<string, unknown>)?.instance ?? item;
      const obj = node as Record<string, unknown>;
      const name = (obj.instanceName ?? obj.name ?? obj.id) as string | undefined;
      if (!name) return null;
      const state = (obj.state ?? obj.connectionStatus ?? obj.status ?? "unknown") as string;
      return {
        instance_name: name,
        state,
        profile_name: (obj.profileName ?? obj.profilename ?? null) as string | null,
        phone_number: (obj.owner ?? obj.ownerJid ?? obj.number ?? null) as string | null,
      };
    })
    .filter((i): i is InstanceSummary => i !== null)
    .sort((a, b) => {
      const rank = (s: string) => (s === "open" ? 0 : s === "connecting" ? 1 : 2);
      return rank(a.state) - rank(b.state) || a.instance_name.localeCompare(b.instance_name);
    });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader
      ? await admin.auth.getUser(authHeader.replace("Bearer ", ""))
      : { data: { user: null } };
    if (!userData?.user) return json({ error: "Não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const server_url: string = (body.server_url ?? "").replace(/\/$/, "");
    const api_key: string = body.api_key ?? "";
    if (!server_url || !api_key) return json({ error: "Informe server_url e api_key." }, 400);

    let resp: Response;
    try {
      resp = await fetch(`${server_url}/instance/fetchInstances`, { headers: { apikey: api_key } });
    } catch (err) {
      if (falhaDeAlcance(err)) return json({ error: mensagemServidorInalcancavel(server_url, err) }, 502);
      throw err;
    }
    if (!resp.ok) {
      const text = await resp.text();
      // 401 aqui é sempre a mesma história e tem uma única correção: a Evolution
      // tem a chave GLOBAL do servidor e uma chave por instância, e só a global
      // autoriza listar. Devolver o JSON cru do servidor ("Unauthorized") não
      // dizia qual das duas estava no campo.
      if (resp.status === 401) {
        return json({ error: ERRO_CHAVE_RECUSADA }, 400);
      }
      return json(
        { error: `O servidor Evolution recusou a listagem (${resp.status}): ${text.slice(0, 200)}` },
        400,
      );
    }

    return json({ instances: normalizar(await resp.json()) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
