// Lista as contas conectadas no Zernio da org (para o painel de Canais).
//
// O cliente (app autenticado) não manda nada além do JWT. A função resolve a
// zernio_config da org, chama a API do Zernio e devolve as contas conectadas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ZERNIO_API = "https://zernio.com/api/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = profile?.org_id as string | undefined;
    if (!orgId) return json({ error: "Organização não encontrada" }, 400);

    const { data: config } = await admin
      .from("zernio_configs")
      .select("api_key, profile_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!config) return json({ error: "Zernio não configurado para esta organização." }, 400);

    const url = new URL(`${ZERNIO_API}/accounts`);
    url.searchParams.set("profileId", config.profile_id as string);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return json({ error: `Zernio recusou a listagem: ${text.slice(0, 200)}` }, 400);
    }
    const data = await resp.json().catch(() => ({}));

    // Devolve só o essencial para o painel (não vaza tokens/metadados sensíveis).
    const accounts = (data.accounts ?? []).map((a: Record<string, unknown>) => ({
      id: a._id,
      platform: a.platform,
      username: a.username,
      displayName: a.displayName,
      profilePicture: a.profilePicture,
      isActive: a.isActive,
      needsReconnection: a.needsReconnection,
    }));

    return json({ ok: true, accounts });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
