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

    // O schema `vault` não é exposto pelo nome qualificado no client: precisa
    // de `.schema("vault")` para o PostgREST resolver a tabela.
    const { data: secret } = await admin
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("id", row.vault_secret_id)
      .maybeSingle();

    const chave = (secret?.decrypted_secret as string | undefined)?.trim();
    if (!chave) {
      return new Response(JSON.stringify({ status: "invalid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validação real por serviço quando existe um endpoint barato de checagem.
    if (service_name === "elevenlabs") {
      try {
        const resp = await fetch("https://api.elevenlabs.io/v1/user", {
          headers: { "xi-api-key": chave },
        });
        return new Response(JSON.stringify({ status: resp.ok ? "valid" : "invalid" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (_) {
        // Falha de rede não prova que a chave é ruim.
        return new Response(JSON.stringify({ status: "error" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Demais serviços (estender conforme necessário):
    // For the base template: presence of a non-empty key counts as 'valid'.
    return new Response(JSON.stringify({ status: "valid" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ status: "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
