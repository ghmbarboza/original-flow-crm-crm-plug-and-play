// Lista as vozes disponíveis no ElevenLabs para a organização do usuário.
//
// A chave NUNCA volta ao frontend: a function resolve a chave da org (Vault via
// `get_org_api_key`) com fallback para a chave da plataforma (env) e devolve
// apenas o essencial de cada voz para o seletor de vozes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolverChaveElevenLabs } from "../_shared/audio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Voz = {
  voice_id: string;
  name: string;
  labels: string[];
  preview_url: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "unauthorized", message: "Sessão inválida." }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = u?.user;
    if (!user) return json({ error: "unauthorized", message: "Sessão inválida." }, 401);

    const { data: perfil } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    const chave = await resolverChaveElevenLabs(admin, perfil?.org_id);
    if (!chave) {
      return json(
        {
          error: "missing_key",
          message: "Configure a chave ElevenLabs primeiro para listar as vozes.",
        },
        400,
      );
    }

    const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": chave },
    });
    if (!resp.ok) {
      const detalhe = await resp.text();
      console.error(`[elevenlabs-voices] falha [${resp.status}]: ${detalhe}`);
      return json(
        {
          error: "provider_error",
          message: resp.status === 401
            ? "A chave do ElevenLabs foi recusada. Salve uma chave válida e tente de novo."
            : "O ElevenLabs não respondeu como esperado. Tente de novo em instantes.",
        },
        resp.status === 401 ? 400 : 502,
      );
    }

    const payload = await resp.json() as {
      voices?: Array<{
        voice_id?: string;
        name?: string;
        preview_url?: string | null;
        labels?: Record<string, string> | null;
      }>;
    };

    const vozes: Voz[] = (payload.voices ?? [])
      .filter((v) => typeof v.voice_id === "string" && v.voice_id)
      .map((v) => ({
        voice_id: v.voice_id!,
        name: v.name ?? "Sem nome",
        // Só os rótulos úteis para escolher: gênero, idade, sotaque, descrição.
        labels: ["gender", "age", "accent", "descriptive", "description", "use_case"]
          .map((k) => v.labels?.[k])
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim()),
        preview_url: v.preview_url ?? null,
      }));

    return json({ voices: vozes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[elevenlabs-voices] erro:", message);
    return json({ error: "internal_error", message: "Não foi possível listar as vozes." }, 500);
  }
});
