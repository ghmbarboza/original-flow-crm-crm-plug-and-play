// Envio de e-mail pelo usuário logado (resposta no inbox, e-mail avulso da ficha).
//
// O provedor vem de Configurações > E-mail (`_shared/email.ts`): Resend como
// e-mail da empresa ou Gmail do próprio usuário. O registro em `emails` fica a
// cargo do módulo compartilhado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enviarEmail } from "../_shared/email.ts";

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

    const { data: perfil } = await admin.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = perfil?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const { to, subject, body_html, contact_id, deal_id, thread_id } = await req.json().catch(() => ({}));
    if (!to || !subject) return json({ error: "Informe to e subject." }, 400);

    const resultado = await enviarEmail(admin, {
      orgId,
      to: String(to),
      subject: String(subject),
      html: String(body_html ?? ""),
      contactId: contact_id ?? null,
      dealId: deal_id ?? null,
      userId: user.id,
      threadId: thread_id ?? null,
    });
    if (!resultado.ok) return json({ error: resultado.motivo ?? "Falha no envio" }, 400);

    return json({ ok: true, provider: resultado.provider, thread_id: resultado.threadId ?? null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
