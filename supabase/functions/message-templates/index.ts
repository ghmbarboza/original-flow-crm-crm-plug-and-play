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

const GRAPH_VERSION = "v21.0";
const ZERNIO_API = "https://zernio.com/api/v1";

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

interface NormalizedTemplate {
  id: string | null;
  name: string;
  status: string;
  category: string;
  language: string;
  body_text: string;
  /** Quantas variáveis o corpo espera — a campanha precisa entregar exatamente isso. */
  param_count: number;
}

/** Extrai o texto do componente BODY, aceitando o type em maiúsculas ou minúsculas. */
function bodyOf(components: unknown): string {
  const list = Array.isArray(components) ? components : [];
  const body = list.find(
    (c) => String((c as { type?: string })?.type ?? "").toLowerCase() === "body",
  ) as { text?: string } | undefined;
  return body?.text ?? "";
}

/** Conta placeholders posicionais distintos ({{1}}, {{2}}, ...) no corpo. */
function paramCount(text: string): number {
  const found = new Set(
    [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]),
  );
  return found.size;
}

function normalize(raw: Record<string, unknown>): NormalizedTemplate {
  const body = bodyOf(raw.components);
  return {
    id: (raw.id as string) ?? null,
    name: String(raw.name ?? ""),
    status: String(raw.status ?? "UNKNOWN").toUpperCase(),
    category: String(raw.category ?? "").toUpperCase(),
    language: String(raw.language ?? ""),
    body_text: body,
    param_count: paramCount(body),
  };
}

/** Resolve a conta de WhatsApp conectada no Zernio (accountId é obrigatório na API). */
async function zernioWhatsAppAccountId(apiKey: string, profileId: string): Promise<string | null> {
  const url = new URL(`${ZERNIO_API}/accounts`);
  url.searchParams.set("profileId", profileId);
  url.searchParams.set("platform", "whatsapp");
  url.searchParams.set("status", "connected");
  const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => ({}));
  const accounts = (data.accounts ?? []) as { _id?: string; isActive?: boolean }[];
  const account = accounts.find((a) => a.isActive) ?? accounts[0];
  return account?._id ?? null;
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

    // ---- Credenciais e endpoints por provedor ----
    let listUrl: string;
    let createUrl: string;
    let headers: Record<string, string>;
    let extraCreateFields: Record<string, unknown> = {};
    // A Meta espera os tipos de componente em maiúsculas; o Zernio, em minúsculas.
    let componentCase: "upper" | "lower";

    if (provider === "meta_official") {
      const { data: metaConfig } = await admin
        .from("meta_configs")
        .select("business_account_id, access_token")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!metaConfig) return json({ error: "Nenhuma instância Meta ativa." }, 400);

      const base = `https://graph.facebook.com/${GRAPH_VERSION}/${metaConfig.business_account_id}/message_templates`;
      listUrl = `${base}?limit=100`;
      createUrl = base;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${metaConfig.access_token}`,
      };
      componentCase = "upper";
    } else {
      const { data: zernioConfig } = await admin
        .from("zernio_configs").select("api_key, profile_id").eq("org_id", orgId).maybeSingle();
      if (!zernioConfig) return json({ error: "Zernio não configurado para esta organização." }, 400);

      const accountId = await zernioWhatsAppAccountId(
        zernioConfig.api_key as string,
        zernioConfig.profile_id as string,
      );
      if (!accountId) {
        return json({ error: "Nenhuma conta de WhatsApp conectada no Zernio." }, 400);
      }

      listUrl = `${ZERNIO_API}/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`;
      createUrl = `${ZERNIO_API}/whatsapp/templates`;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${zernioConfig.api_key}`,
      };
      extraCreateFields = { accountId };
      componentCase = "lower";
    }

    // ---- list ----
    if (action === "list") {
      const resp = await fetch(listUrl, { headers });
      if (!resp.ok) {
        const text = await resp.text();
        return json({ error: `Falha ao listar templates: ${text.slice(0, 200)}` }, 400);
      }
      const data = await resp.json().catch(() => ({}));
      // Meta devolve em `data`; Zernio, em `templates`.
      const raw = (data.templates ?? data.data ?? []) as Record<string, unknown>[];
      return json({ provider, templates: raw.map(normalize) });
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
      const expected = paramCount(bodyText);
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
