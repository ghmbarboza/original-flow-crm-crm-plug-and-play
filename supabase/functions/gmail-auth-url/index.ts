// Devolve a URL de consentimento OAuth do Google para conectar o Gmail.
//
// O estado (state) carrega user_id/org_id/redirect para o callback saber a quem
// pertence a conexão. Requer os secrets GOOGLE_CLIENT_ID e APP_URL (base do app).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assinarEstado, resolverCredenciaisGoogle } from "../_shared/google.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

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

    const { data: profile } = await admin.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (!profile?.org_id) return json({ error: "Organização não encontrada" }, 400);

    // Credencial da organização (Vault) com fallback no env — ver
    // resolverCredenciaisGoogle. A mensagem diz ONDE resolver: antes o usuário
    // lia "GOOGLE_CLIENT_ID não configurado" e não tinha para onde ir.
    const { clientId } = await resolverCredenciaisGoogle(admin, profile.org_id as string);
    if (!clientId) {
      return json({
        error:
          "Conexão do Gmail ainda não configurada. Cadastre o Client ID e o Client Secret do " +
          "Google em Configurações > Integrações > E-mail (Gmail).",
      }, 400);
    }

    const { redirect_path } = await req.json().catch(() => ({}));

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth-callback`;
    const state = await assinarEstado({
      user_id: user.id,
      org_id: profile.org_id as string,
      redirect_path: redirect_path ?? "/inbox",
    });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    return json({ url: url.toString() });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
