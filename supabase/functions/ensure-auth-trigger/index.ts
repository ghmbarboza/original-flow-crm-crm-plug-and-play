import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return json({ ok: false, message: "Missing service env vars" });
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Ensure trigger exists; create if missing
    const triggerResult = await admin.rpc("ensure_auth_trigger");
    if (triggerResult.error) {
      return json({
        ok: false,
        message: `RPC ensure_auth_trigger failed: ${triggerResult.error.message}`,
      });
    }
    const triggerData = (triggerResult.data ?? {}) as {
      ok?: boolean;
      created?: boolean;
      message?: string;
    };

    // 2. Inspect handle_new_user body to detect outdated versions
    const { data: defText, error: defErr } = await admin.rpc(
      "get_handle_new_user_def",
    );
    const def = (defText ?? "") as string;
    const insertsRole = def.includes("public.user_roles");
    const assignsAdmin = def.includes("'admin'::app_role");
    const assignsMember = def.includes("'member'::app_role");
    // Versão legada usava o role 'agent'; considere desatualizada se ainda aparecer.
    const usesLegacyAgent = def.includes("'agent'::app_role");

    // 3. Counts for diagnostics
    const [{ count: profilesCount }, { data: adminRows }] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("user_roles").select("user_id").eq("role", "admin"),
    ]);

    const adminsCount = adminRows?.length ?? 0;

    const ok =
      !!triggerData.ok &&
      !defErr &&
      insertsRole &&
      assignsAdmin &&
      assignsMember &&
      !usesLegacyAgent;

    return json({
      ok,
      trigger: {
        exists: !triggerData.created || triggerData.created,
        recreated: !!triggerData.created,
        name: "on_auth_user_created",
      },
      function: {
        exists: !defErr && def.length > 0,
        insertsRole,
        assignsAdmin,
        assignsMember,
        usesLegacyAgent,
      },
      counts: {
        profiles: profilesCount ?? 0,
        admins: adminsCount,
      },
      message: ok
        ? "Auth bootstrap pronto para remix."
        : "Versão desatualizada de handle_new_user detectada — rode a migration mais recente.",
    });
  } catch (err) {
    return json({
      ok: false,
      message: `Auth trigger check failed: ${(err as Error).message}`,
    });
  }
});
