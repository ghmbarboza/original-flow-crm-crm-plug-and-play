import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { credencial as env } from "./helpers";

/**
 * Pré-condição da suíte: a organização de teste já concluiu o setup inicial.
 *
 * POR QUE ISSO EXISTE: o guard do Sprint 9 redireciona todo admin com
 * `setup_completed = false` para /setup. A suíte loga como admin, então sem esta
 * garantia TODOS os specs seriam redirecionados para o wizard e falhariam — não
 * por regressão, mas porque a org nunca passou pelo onboarding.
 *
 * A suíte cobre a plataforma em operação, que é o estado depois do setup. O
 * wizard em si é coberto pelo próprio spec de setup, que reverte o flag no
 * início e o restaura no fim.
 *
 * Credenciais seguem a mesma regra do teardown: SUPABASE_SERVICE_ROLE_KEY quando
 * existir, senão a sessão do usuário do E2E. Vêm do ambiente ou do `.env` local
 * (que é gitignored) — nunca do código versionado. Ver `credencial` em helpers.
 */

async function marcarSetupConcluido(client: SupabaseClient, orgId: string) {
  const { error } = await client
    .from("organizations")
    .update({ setup_completed: true })
    .eq("id", orgId)
    .is("setup_completed", false);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e setup] não foi possível marcar o setup como concluído: ${error.message}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log("[e2e setup] organização de teste com setup concluído.");
}

export default async function globalSetup() {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  if (!url) {
    // eslint-disable-next-line no-console
    console.warn("[e2e setup] SUPABASE_URL ausente; pré-condição não aplicada.");
    return;
  }

  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const email = env("E2E_EMAIL") ?? "sabrina@viverdeia.ai";

  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("email", email).maybeSingle();
    if (profile?.org_id) await marcarSetupConcluido(admin, profile.org_id as string);
    return;
  }

  const anonKey = env("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  const password = env("E2E_PASSWORD");
  if (!anonKey || !password) {
    // eslint-disable-next-line no-console
    console.warn("[e2e setup] sem credenciais; pré-condição não aplicada.");
    return;
  }

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError || !auth.user) {
    // eslint-disable-next-line no-console
    console.warn(`[e2e setup] login falhou (${authError?.message}); pré-condição não aplicada.`);
    return;
  }
  const { data: profile } = await client
    .from("profiles").select("org_id").eq("id", auth.user.id).maybeSingle();
  if (profile?.org_id) await marcarSetupConcluido(client, profile.org_id as string);
  await client.auth.signOut();
}
