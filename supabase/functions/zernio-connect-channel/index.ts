// Inicia a conexão de um canal via Zernio (OAuth).
//
// Recebe { channel }. Resolve a zernio_config da org (apenas admin), pede ao
// Zernio a URL de autorização OAuth do canal e a devolve para o front redirecionar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ZERNIO_API = "https://zernio.com/api/v1";

// Plataformas aceitas pelo endpoint /connect do Zernio.
const PLATFORMS = new Set([
  "facebook", "instagram", "linkedin", "twitter", "tiktok", "youtube", "threads",
  "reddit", "pinterest", "bluesky", "googlebusiness", "telegram", "snapchat",
  "discord", "whatsapp",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // Conectar canal é ação administrativa.
    const { data: adminRole } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) return json({ error: "Apenas administradores podem conectar canais." }, 403);

    const { channel, redirect_url } = await req.json().catch(() => ({}));
    if (!channel || !PLATFORMS.has(channel)) {
      return json({ error: "Canal inválido ou não suportado pelo Zernio." }, 400);
    }

    const { data: config } = await admin
      .from("zernio_configs")
      .select("api_key, profile_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!config) return json({ error: "Zernio não configurado para esta organização." }, 400);

    const url = new URL(`${ZERNIO_API}/connect/${channel}`);
    url.searchParams.set("profileId", config.profile_id as string);
    if (redirect_url) url.searchParams.set("redirect_url", redirect_url);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      return json({ error: `Zernio recusou a conexão: ${text.slice(0, 200)}` }, 400);
    }
    const data = await resp.json().catch(() => ({}));
    if (!data.authUrl) return json({ error: "Zernio não retornou a URL de autorização." }, 502);

    return json({ ok: true, authUrl: data.authUrl });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
