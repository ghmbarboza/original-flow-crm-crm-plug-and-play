import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getUser(req: Request, admin: any) {
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

    // Try to update existing vault secret if registry has one
    const { data: existing } = await admin
      .from("api_keys_registry")
      .select("vault_secret_id")
      .eq("user_id", user.id)
      .eq("service_name", service_name)
      .maybeSingle();

    let vaultSecretId: string;

    if (existing?.vault_secret_id) {
      const { error: updErr } = await admin.rpc("vault_update_secret" as any, {
        secret_id: existing.vault_secret_id, new_secret: api_key,
      } as any).select?.() ?? { error: null };
      // Fallback: direct call via raw SQL not available — rely on insert+swap
      vaultSecretId = existing.vault_secret_id;
      // Best-effort: Supabase client lacks a Vault RPC; we replace by deleting + creating
      try {
        await admin.from("vault.secrets" as any).delete().eq("id", existing.vault_secret_id);
      } catch (_) { /* ignore */ }
      const { data: ins } = await admin.rpc("create_secret" as any, {
        new_secret: api_key, new_name: secretName, new_description: label ?? service_name,
      } as any);
      if (ins) vaultSecretId = ins as unknown as string;
    } else {
      const { data: ins, error: insErr } = await admin.rpc("create_secret" as any, {
        new_secret: api_key, new_name: secretName, new_description: label ?? service_name,
      } as any);
      if (insErr || !ins) {
        return new Response(JSON.stringify({ error: "Falha ao salvar no Vault", details: insErr?.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      vaultSecretId = ins as unknown as string;
    }

    await admin.from("api_keys_registry").upsert({
      user_id: user.id,
      service_name,
      vault_secret_id: vaultSecretId,
      label: label ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,service_name" });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
