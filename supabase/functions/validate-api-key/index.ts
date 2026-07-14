import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Generic validator stub — projects that remix this template should extend it
// with concrete per-service test calls. Returns 'valid' if a key exists in vault.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ status: "error" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = u?.user;
    if (!user) return new Response(JSON.stringify({ status: "error" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { service_name } = await req.json();
    if (!service_name) return new Response(JSON.stringify({ status: "error" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { data: row } = await admin
      .from("api_keys_registry")
      .select("vault_secret_id, is_active")
      .eq("user_id", user.id)
      .eq("service_name", service_name)
      .maybeSingle();

    if (!row?.vault_secret_id) {
      return new Response(JSON.stringify({ status: "invalid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read decrypted value from vault.decrypted_secrets
    const { data: secret } = await admin
      .from("vault.decrypted_secrets" as any)
      .select("decrypted_secret")
      .eq("id", row.vault_secret_id)
      .maybeSingle();

    if (!secret?.decrypted_secret) {
      return new Response(JSON.stringify({ status: "invalid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per-service validation (extend in your project)
    // For the base template: presence of a non-empty key counts as 'valid'.
    return new Response(JSON.stringify({ status: "valid" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ status: "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
