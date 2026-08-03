import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getUser(req: Request, admin: SupabaseClient) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  return data?.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const user = await getUser(req, admin);
    if (!user) return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

    const { service_name, api_key, label } = await req.json();
    if (!service_name || !api_key || typeof service_name !== "string" || typeof api_key !== "string") {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secretName = `${service_name}_${user.id}`;

    // A chave vale para a organização inteira (ex.: ElevenLabs usado pelos
    // webhooks e pela ai-reply), não só para quem a cadastrou.
    const { data: perfil } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    // Try to update existing vault secret if registry has one
    const { data: existing } = await admin
      .from("api_keys_registry")
      .select("vault_secret_id")
      .eq("user_id", user.id)
      .eq("service_name", service_name)
      .maybeSingle();

    let vaultSecretId: string;

    if (existing?.vault_secret_id) {
      // Best-effort: tenta atualizar o segredo existente antes do swap por delete+create.
      await admin.rpc("vault_update_secret", {
        secret_id: existing.vault_secret_id, new_secret: api_key,
      }).select?.();
      // Fallback: direct call via raw SQL not available — rely on insert+swap
      vaultSecretId = existing.vault_secret_id;
      // Best-effort: Supabase client lacks a Vault RPC; we replace by deleting + creating
      try {
        await admin.from("vault.secrets").delete().eq("id", existing.vault_secret_id);
      } catch (_) { /* ignore */ }
      const { data: ins } = await admin.rpc("create_secret", {
        new_secret: api_key, new_name: secretName, new_description: label ?? service_name,
      });
      if (ins) vaultSecretId = ins as unknown as string;
    } else {
      const { data: ins, error: insErr } = await admin.rpc("create_secret", {
        new_secret: api_key, new_name: secretName, new_description: label ?? service_name,
      });
      if (insErr || !ins) {
        return new Response(JSON.stringify({ error: "Falha ao salvar no Vault", details: insErr?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      vaultSecretId = ins as unknown as string;
    }

    await admin.from("api_keys_registry").upsert({
      user_id: user.id,
      org_id: perfil?.org_id ?? null,
      service_name,
      vault_secret_id: vaultSecretId,
      label: label ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,service_name" });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
