// Callback do OAuth do Google: troca o code por tokens e grava a conexão.
//
// O Google redireciona para cá com ?code&state. Trocamos o code por access/refresh
// token, descobrimos o email da conta e gravamos em email_connections. Por fim,
// redirecionamos de volta ao app. Requer GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const appUrl = Deno.env.get("APP_URL") ?? "";

  function redirect(path: string) {
    return new Response(null, { status: 302, headers: { Location: `${appUrl}${path}` } });
  }

  if (!code || !stateRaw) return redirect("/inbox?email_error=missing_code");

  try {
    const state = JSON.parse(atob(stateRaw)) as { user_id: string; org_id: string; redirect_path: string };
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth-callback`;

    // Troca o code por tokens.
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResp.ok) return redirect(`${state.redirect_path}?email_error=token`);
    const tokens = await tokenResp.json();

    // Descobre o email da conta.
    const infoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoResp.json().catch(() => ({}));
    const email = info?.email ?? "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const expiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Uma conexão por usuário: desativa as antigas e grava a nova.
    await admin
      .from("email_connections")
      .update({ is_active: false })
      .eq("org_id", state.org_id)
      .eq("user_id", state.user_id);

    await admin.from("email_connections").insert({
      org_id: state.org_id,
      user_id: state.user_id,
      provider: "gmail",
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expiry: expiry,
      is_active: true,
    });

    return redirect(`${state.redirect_path}?email_connected=1`);
  } catch (_err) {
    return redirect("/inbox?email_error=callback");
  }
});
