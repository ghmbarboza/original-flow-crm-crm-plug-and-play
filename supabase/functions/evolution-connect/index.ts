// Cria/conecta uma instância Evolution e devolve o QR Code para parear o número.
//
// Fluxo:
//  1. Autentica o usuário e resolve a org.
//  2. Cria a instância no servidor Evolution (ou reaproveita se já existir).
//  3. Registra o webhook da instância apontando para `evolution-webhook`.
//  4. Persiste a instância em `evolution_configs` com o QR Code.
//
// A api_key da Evolution fica só no banco (protegido por RLS) — nunca volta ao cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader
      ? await admin.auth.getUser(authHeader.replace("Bearer ", ""))
      : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = profile?.org_id;
    if (!orgId) return json({ error: "Organização não encontrada" }, 400);

    const body = await req.json().catch(() => ({}));
    const server_url: string = (body.server_url ?? "").replace(/\/$/, "");
    const api_key: string = body.api_key ?? "";
    const instance_name: string = body.instance_name ?? "";
    const display_name: string = body.display_name ?? instance_name;

    if (!server_url || !api_key || !instance_name) {
      return json({ error: "Informe server_url, api_key e instance_name." }, 400);
    }

    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook`;

    // 1. Cria a instância (a Evolution devolve o QR na criação com qrcode:true).
    let qrCode: string | null = null;
    let status = "connecting";

    const createResp = await fetch(`${server_url}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: api_key },
      body: JSON.stringify({
        instanceName: instance_name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          url: webhookUrl,
          byEvents: false,
          base64: true,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
        },
      }),
    });

    if (createResp.ok) {
      const created = await createResp.json();
      qrCode = created?.qrcode?.base64 ?? created?.qrcode?.code ?? null;
    } else if (createResp.status === 403 || createResp.status === 409) {
      // Instância já existe: busca o QR pelo endpoint de connect.
      const connectResp = await fetch(`${server_url}/instance/connect/${instance_name}`, {
        headers: { apikey: api_key },
      });
      if (connectResp.ok) {
        const connect = await connectResp.json();
        qrCode = connect?.base64 ?? connect?.code ?? null;
        if (connect?.instance?.state === "open") status = "connected";
      } else {
        const text = await connectResp.text();
        return json({ error: `Evolution recusou a conexão: ${text.slice(0, 200)}` }, 400);
      }
    } else {
      const text = await createResp.text();
      return json({ error: `Falha ao criar instância: ${text.slice(0, 200)}` }, 400);
    }

    // 2. Persiste (upsert por instância dentro da org).
    const { data: existing } = await admin
      .from("evolution_configs")
      .select("id")
      .eq("org_id", orgId)
      .eq("instance_name", instance_name)
      .maybeSingle();

    const record = {
      org_id: orgId,
      server_url,
      api_key,
      instance_name,
      display_name,
      qr_code: qrCode,
      status,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    let instanceId: string;
    if (existing?.id) {
      await admin.from("evolution_configs").update(record).eq("id", existing.id);
      instanceId = existing.id;
    } else {
      const { data: inserted, error } = await admin
        .from("evolution_configs")
        .insert(record)
        .select("id")
        .single();
      if (error) return json({ error: `Falha ao salvar instância: ${error.message}` }, 500);
      instanceId = inserted.id;
    }

    return json({ instance_id: instanceId, qr_code: qrCode, status });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
