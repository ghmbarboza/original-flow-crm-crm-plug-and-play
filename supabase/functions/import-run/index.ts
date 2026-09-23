// Importação universal (Sprint 12 B8): grava um lote de linhas já mapeadas.
// O front lê o CSV, aplica o de/para e manda lotes de até 500 registros
// {row_number, data}. A lógica fica em _shared/importar.ts, compartilhada com
// a sincronização de outros CRMs (crm-connect).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { importarLote, novoCtx, type Dados } from "../_shared/importar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LOTE_MAX = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader ? await admin.auth.getUser(authHeader.replace("Bearer ", "")) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: perfil } = await admin.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = perfil?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const body = await req.json().catch(() => ({}));
    const importId = typeof body.import_id === "string" ? body.import_id : "";
    const linhas = Array.isArray(body.rows) ? (body.rows as { row_number: number; data: Dados }[]).slice(0, LOTE_MAX) : [];
    if (!importId) return json({ error: "Informe import_id." }, 400);
    const { data: imp } = await admin.from("imports").select("id, kind, mapping, status").eq("id", importId).eq("org_id", orgId).maybeSingle();
    if (!imp) return json({ error: "Importação não encontrada." }, 404);
    if (imp.status === "undone" || imp.status === "completed") return json({ error: "Esta importação já foi encerrada." }, 409);
    await admin.from("imports").update({ status: "processing" }).eq("id", importId);

    const mapping = (imp.mapping ?? {}) as { stages?: Record<string, string> };
    const ctx = novoCtx(admin, orgId, importId, imp.kind as string, mapping.stages ?? {});
    const resultado = await importarLote(ctx, linhas);
    return json({ ok: true, ...resultado });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
