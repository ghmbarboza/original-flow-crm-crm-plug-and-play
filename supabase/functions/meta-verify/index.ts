// Verifica as credenciais da WhatsApp Business Platform (Meta) e registra a instância.
//
// Confere o phone_number_id contra a Graph API com o access_token informado. Se
// a chamada responde com o número, as credenciais são válidas e persistimos a
// instância em `meta_configs`. O access_token fica só no banco (RLS).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH_VERSION = "v21.0";

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
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = profile?.org_id;
    if (!orgId) return json({ error: "Organização não encontrada" }, 400);

    const body = await req.json().catch(() => ({}));
    const phone_number_id: string = body.phone_number_id ?? "";
    const business_account_id: string = body.business_account_id ?? "";
    const access_token: string = body.access_token ?? "";
    const display_name: string = body.display_name ?? "";
    // Sem o App Secret o meta-webhook não consegue provar que a mensagem veio da
    // Meta e recusa tudo, então ele é obrigatório já na conexão.
    const app_secret: string = (body.app_secret ?? "").trim();

    if (!phone_number_id || !business_account_id || !access_token || !app_secret) {
      return json({ error: "Informe phone_number_id, business_account_id, access_token e App Secret." }, 400);
    }

    // Verifica o número na Graph API.
    const verifyResp = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phone_number_id}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    if (!verifyResp.ok) {
      const err = await verifyResp.json().catch(() => ({}));
      const message = err?.error?.message ?? "Credenciais Meta inválidas.";
      return json({ error: message }, 400);
    }

    const info = await verifyResp.json();
    const phoneNumber: string | null = info?.display_phone_number ?? null;

    const record = {
      org_id: orgId,
      phone_number_id,
      business_account_id,
      access_token,
      app_secret,
      phone_number: phoneNumber,
      display_name: display_name || info?.verified_name || "WhatsApp Business",
      status: "connected",
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await admin
      .from("meta_configs")
      .select("id, webhook_verify_token, webhook_verified")
      .eq("org_id", orgId)
      .eq("phone_number_id", phone_number_id)
      .maybeSingle();

    // webhook_verified só vira true quando a Meta chama o GET de verificação
    // com o verify token certo (meta-webhook). Antes era gravado true aqui, sem
    // nenhuma verificação real.
    let saved: { id: string; webhook_verify_token: string; webhook_verified: boolean };
    if (existing?.id) {
      const { data, error } = await admin
        .from("meta_configs").update(record).eq("id", existing.id)
        .select("id, webhook_verify_token, webhook_verified").single();
      if (error) return json({ error: `Falha ao salvar instância: ${error.message}` }, 500);
      saved = data;
    } else {
      const { data, error } = await admin
        .from("meta_configs")
        .insert({ ...record, webhook_verified: false })
        .select("id, webhook_verify_token, webhook_verified")
        .single();
      if (error) return json({ error: `Falha ao salvar instância: ${error.message}` }, 500);
      saved = data;
    }

    return json({
      instance_id: saved.id,
      phone_number: phoneNumber,
      webhook_verify_token: saved.webhook_verify_token,
      webhook_verified: saved.webhook_verified,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
