// Reconcilia o estado de uma instância Evolution com o servidor.
//
// POR QUE ISSO EXISTE: o wizard depende do webhook `CONNECTION_UPDATE` para
// saber que o número pareou. Se esse evento se perde — servidor sem rota de
// saída, reinício no meio do handshake, evento fora de ordem — o banco fica
// dizendo "connecting" para sempre e a tela segue mostrando um QR de um número
// já conectado, sem nenhum caminho de recuperação a não ser mexer no banco.
//
// Aqui o CRM pergunta ao servidor em vez de esperar que ele avise. A pergunta é
// barata (`GET /instance/connectionState`) e o resultado é a verdade.
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
      .from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = profile?.org_id;
    if (!orgId) return json({ error: "Organização não encontrada" }, 400);

    const body = await req.json().catch(() => ({}));
    const instanceId: string = body.instance_id ?? "";
    if (!instanceId) return json({ error: "Informe instance_id." }, 400);

    // O filtro por org é o que impede sincronizar instância de outra empresa.
    const { data: instancia } = await admin
      .from("evolution_configs")
      .select("id, server_url, api_key, instance_name, status")
      .eq("id", instanceId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!instancia) return json({ error: "Instância não encontrada." }, 404);

    const resp = await fetch(
      `${instancia.server_url}/instance/connectionState/${instancia.instance_name}`,
      { headers: { apikey: instancia.api_key } },
    );
    if (!resp.ok) {
      return json({ error: `O servidor não respondeu o estado (${resp.status}).` }, 400);
    }

    const corpo = await resp.json().catch(() => null);
    const state: string | null = corpo?.instance?.state ?? null;
    if (state !== "open" && state !== "close") {
      // Ainda pareando: nada a reconciliar, e escrever "connecting" por cima
      // repetiria o defeito que esta function existe para consertar.
      return json({ status: instancia.status, state });
    }

    const conectou = state === "open";
    const status = conectou ? "connected" : "disconnected";
    if (status !== instancia.status) {
      await admin
        .from("evolution_configs")
        .update({
          status,
          connected_at: conectou ? new Date().toISOString() : null,
          qr_code: conectou ? null : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", instancia.id);
    }

    return json({ status, state, reconciliado: status !== instancia.status });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
