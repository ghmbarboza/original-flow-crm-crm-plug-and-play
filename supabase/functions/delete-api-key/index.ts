import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = u?.user;
    if (!user) return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { service_name } = await req.json();
    if (!service_name) return new Response(JSON.stringify({ error: "service_name requerido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { data: row } = await admin
      .from("api_keys_registry")
      .select("vault_secret_id")
      .eq("user_id", user.id)
      .eq("service_name", service_name)
      .maybeSingle();

    if (row?.vault_secret_id) {
      try { await admin.from("vault.secrets" as any).delete().eq("id", row.vault_secret_id); } catch (_) {}
    }

    await admin.from("api_keys_registry")
      .delete()
      .eq("user_id", user.id)
      .eq("service_name", service_name);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
