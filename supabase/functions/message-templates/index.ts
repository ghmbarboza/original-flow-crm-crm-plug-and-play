// Templates de mensagem do WhatsApp — listar e criar, nos dois provedores oficiais.
//
// A Meta não permite mensagem livre para abrir conversa de negócio: campanhas e
// reengajamento fora da janela de 24h só saem por template aprovado. Esta função
// centraliza isso para que o CRM não dependa do Business Manager.
//
//   action=list   → devolve os templates da conta, já normalizados
//   action=create → submete um template novo para aprovação
//
// Provedor vem de messaging_config.provider:
//   meta_official → Graph API, em /{business_account_id}/message_templates
//   zernio        → API do Zernio, em /v1/whatsapp/templates (precisa do accountId)
//
// Evolution não tem template (é API não-oficial) e é recusada explicitamente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { acessoAosTemplates, contarParametros, listarTemplates } from "../_shared/templateWhatsapp.ts";

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
    const orgId = profile?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action ?? "list");

    const { data: messaging } = await admin
      .from("messaging_config").select("provider").eq("org_id", orgId).maybeSingle();
    const provider = messaging?.provider as string | undefined;

    if (provider === "evolution") {
      return json({
        error: "A Evolution API não usa templates. Templates existem apenas na API Oficial (Meta) e no Zernio.",
      }, 400);
    }
    if (provider !== "meta_official" && provider !== "zernio") {
      return json({ error: "Configure um provedor oficial (Meta ou Zernio) para usar templates." }, 400);
    }

    const acesso = await acessoAosTemplates(admin, orgId, provider);
    if ("erro" in acesso) return json({ error: acesso.erro }, 400);
    const { createUrl, headers, extraCreateFields, componentCase } = acesso;

    // ---- list ----
    if (action === "list") {
      const lista = await listarTemplates(acesso);
      if ("erro" in lista) return json({ error: lista.erro }, 400);
      return json({ provider, templates: lista.templates });
    }

    // ---- create ----
    if (action === "create") {
      const name = String(payload.name ?? "").trim();
      const category = String(payload.category ?? "UTILITY").toUpperCase();
      const language = String(payload.language ?? "").trim();
      const bodyText = String(payload.body_text ?? "").trim();
      const footerText = String(payload.footer_text ?? "").trim();
      const exampleParams = Array.isArray(payload.example_params)
        ? (payload.example_params as unknown[]).map((v) => String(v))
        : [];

      if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        return json({
          error: "Nome inválido. Use apenas minúsculas, números e underscore, começando por letra.",
        }, 400);
      }
      if (!language) return json({ error: "Informe o idioma do template (ex.: pt_BR)." }, 400);
      if (!bodyText) return json({ error: "Informe o corpo do template." }, 400);
      if (!["AUTHENTICATION", "MARKETING", "UTILITY"].includes(category)) {
        return json({ error: "Categoria inválida." }, 400);
      }

      // A Meta exige valores de exemplo para cada placeholder posicional do corpo.
      const expected = contarParametros(bodyText);
      if (expected !== exampleParams.length) {
        return json({
          error: `O corpo tem ${expected} variável(is), mas foram enviados ${exampleParams.length} valor(es) de exemplo.`,
        }, 400);
      }

      const t = (s: string) => (componentCase === "upper" ? s.toUpperCase() : s.toLowerCase());
      const components: Record<string, unknown>[] = [
        {
          type: t("body"),
          text: bodyText,
          ...(expected > 0 ? { example: { body_text: [exampleParams] } } : {}),
        },
      ];
      if (footerText) components.push({ type: t("footer"), text: footerText });

      const resp = await fetch(createUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...extraCreateFields, name, category, language, components }),
      });

      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = result?.error?.error_user_msg
          ?? result?.error?.message
          ?? result?.error
          ?? JSON.stringify(result).slice(0, 200);
        return json({ error: `Provedor recusou o template: ${detail}` }, 400);
      }

      // Meta devolve o objeto na raiz; Zernio, dentro de `template`.
      const created = (result.template ?? result) as Record<string, unknown>;
      return json({
        ok: true,
        provider,
        template: {
          id: created.id ?? null,
          name: created.name ?? name,
          // Template de biblioteca já nasce aprovado; customizado entra em revisão.
          status: String(created.status ?? "PENDING").toUpperCase(),
          category: String(created.category ?? category).toUpperCase(),
          language: String(created.language ?? language),
        },
      });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
