// Configurações > E-mail: ações que precisam de segredo do lado do servidor.
//
//   action=domain_status → consulta os domínios da conta Resend e diz se o
//                          domínio do remetente está verificado (com os registros DNS)
//   action=send_test     → manda um e-mail de teste para o próprio usuário pelo
//                          provedor configurado, provando a configuração de ponta a ponta
//
// Chamada pelo front com a sessão do usuário; a org vem do perfil.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enviarEmail, lerConfiguracaoEmail, RESEND_API_PADRAO } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface DominioResend {
  id: string;
  name: string;
  status: string;
  records?: { record: string; name: string; type: string; value: string; status?: string }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader
      ? await admin.auth.getUser(authHeader.replace("Bearer ", ""))
      : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: perfil } = await admin.from("profiles").select("org_id, full_name").eq("id", user.id).maybeSingle();
    const orgId = perfil?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const { action } = await req.json().catch(() => ({}));
    const cfg = await lerConfiguracaoEmail(admin, orgId);

    if (action === "domain_status") {
      const fromEmail = (cfg?.from_email ?? "").trim().toLowerCase();
      const dominio = fromEmail.split("@")[1] ?? "";
      if (!dominio) return json({ error: "Informe o e-mail do remetente antes de verificar o domínio." }, 400);
      const { data: chave } = await admin.rpc("get_org_api_key", { _org_id: orgId, _service: "resend" });
      if (typeof chave !== "string" || !chave) return json({ error: "Salve a chave do Resend antes de verificar o domínio." }, 400);
      const base = (cfg?.api_base ?? RESEND_API_PADRAO).replace(/\/$/, "");
      const resp = await fetch(`${base}/domains`, { headers: { Authorization: `Bearer ${chave}` } });
      if (!resp.ok) return json({ error: `O Resend recusou a consulta (${resp.status}). Confira a chave.` }, 400);
      const corpo = await resp.json().catch(() => ({}));
      const lista = (corpo?.data ?? []) as DominioResend[];
      const achado = lista.find((d) => d.name?.toLowerCase() === dominio);
      const verificado = achado?.status === "verified";
      await admin.from("email_settings").update({ domain_verified: verificado, updated_at: new Date().toISOString() }).eq("org_id", orgId);
      return json({
        domain: dominio,
        found: !!achado,
        verified: verificado,
        status: achado?.status ?? "not_found",
        records: (achado?.records ?? []).map((r) => ({ record: r.record, name: r.name, type: r.type, value: r.value, status: r.status ?? null })),
      });
    }

    if (action === "send_test") {
      const destino = user.email ?? "";
      if (!destino) return json({ error: "Seu usuário não tem e-mail para receber o teste." }, 400);
      const nome = (perfil?.full_name as string | null)?.split(" ")[0] ?? "";
      const resultado = await enviarEmail(admin, {
        orgId,
        to: destino,
        subject: "Teste de e-mail do CRM",
        html: `<p>Olá${nome ? `, ${nome}` : ""}.</p><p>Este é um e-mail de teste enviado pela configuração de E-mail do CRM. Se chegou, o envio está funcionando.</p>`,
        text: `Olá${nome ? `, ${nome}` : ""}. Este é um e-mail de teste enviado pela configuração de E-mail do CRM.`,
        userId: user.id,
      });
      if (!resultado.ok) return json({ error: resultado.motivo ?? "Falha no envio" }, 400);
      return json({ ok: true, provider: resultado.provider, to: destino });
    }

    return json({ error: "Ação inválida. Use domain_status ou send_test." }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
