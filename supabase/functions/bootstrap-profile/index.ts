import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Idempotent fallback that mirrors handle_new_user() trigger logic.
// Used when remix did not replicate the trigger on auth.users.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate the caller's token and only allow them to bootstrap their own profile.
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;
    const email = userData.user.email ?? "";
    const fullName =
      (userData.user.user_metadata?.full_name as string | undefined) ?? "Usuário";

    // If profile already exists (trigger ran), return current state — nothing to do.
    const { data: existing } = await admin
      .from("profiles")
      .select("id, is_approved, is_active")
      .eq("id", callerId)
      .maybeSingle();

    if (existing) {
      // Make sure a role row also exists. If this is the only profile in the system,
      // elevate the user to admin (covers cases where the trigger created the profile
      // but failed to insert the role row).
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .maybeSingle();

      let effectiveRole = roleRow?.role ?? null;
      let effectiveApproval = !!existing.is_approved;

      if (!roleRow) {
        const { count: totalProfiles } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true });
        const aloneInSystem = (totalProfiles ?? 0) <= 1;
        const fallbackRole = aloneInSystem ? "admin" : "member";
        await admin.from("user_roles").insert({ user_id: callerId, role: fallbackRole });
        effectiveRole = fallbackRole;

        if (aloneInSystem && !existing.is_approved) {
          await admin.from("profiles").update({ is_approved: true }).eq("id", callerId);
          effectiveApproval = true;
        }
      }

      return new Response(JSON.stringify({
        created: false,
        isApproved: effectiveApproval,
        role: effectiveRole ?? "member",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determine "first user" status. Race with concurrent signups is mitigated by
    // ON CONFLICT below + the fact that the very first remix user typically signs up alone.
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    const isFirstUser = !count || count === 0;

    let requireApproval = false;
    const { data: cfg } = await admin
      .from("project_config")
      .select("value")
      .eq("key", "require_account_approval")
      .maybeSingle();
    if (cfg?.value === "true") requireApproval = true;

    const isApproved = isFirstUser ? true : !requireApproval;
    const role = isFirstUser ? "admin" : "member";

    // Idempotent inserts.
    const { error: profErr } = await admin.from("profiles").upsert({
      id: callerId,
      full_name: fullName,
      email,
      is_approved: isApproved,
    }, { onConflict: "id", ignoreDuplicates: true });

    if (profErr) {
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("user_roles").upsert(
      { user_id: callerId, role },
      { onConflict: "user_id,role", ignoreDuplicates: true }
    );

    return new Response(JSON.stringify({ created: true, isApproved, role }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
