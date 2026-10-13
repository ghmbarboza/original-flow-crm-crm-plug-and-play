import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Mesmos nomes de SERVICOS_DE_IA em _shared/ai.ts.
const SERVICOS_SO_ADMIN = ["anthropic", "openai", "gemini"];

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

    // Chave de IA vale para o atendimento da organização inteira, e quem a
    // controla lê as conversas no painel do provedor: só administrador cadastra.
    // (A leitura confere de novo, em get_org_ai_keys.)
    if (SERVICOS_SO_ADMIN.includes(service_name)) {
      const { data: ehAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (ehAdmin !== true) {
        return new Response(JSON.stringify({ error: "Só administradores cadastram a chave de IA da conta." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const secretName = `${service_name}_${user.id}`;

    // A chave vale para a organização inteira (ex.: ElevenLabs usado pelos
    // webhooks e pela ai-reply), não só para quem a cadastrou.
    const { data: perfil } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    // `public.create_secret` é idempotente: se já existe um segredo com esse
    // nome, ele atualiza o valor e devolve o MESMO id. Por isso não há ramo de
    // update aqui — um único caminho cobre cadastro e troca de chave.
    const { data: secretId, error: secretErr } = await admin.rpc("create_secret", {
      new_secret: api_key,
      new_name: secretName,
      new_description: label ?? service_name,
    });

    if (secretErr || !secretId) {
      return new Response(
        JSON.stringify({ error: "Falha ao salvar no Vault", details: secretErr?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const vaultSecretId = secretId as unknown as string;

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
