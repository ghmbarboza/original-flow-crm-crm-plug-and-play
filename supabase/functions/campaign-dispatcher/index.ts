// Dispara uma campanha de WhatsApp pelos provedores oficiais: Meta e Zernio.
//
// Carrega os destinatários pendentes, personaliza a mensagem por contato e envia,
// atualizando o status de cada destinatário e o contador da campanha.
//
// Regra de negócio do Sprint 7: campanhas valem para Meta Oficial e Zernio.
// A Evolution fica bloqueada — é API não-oficial, sujeita a bloqueio por spam.
//
// Sobre templates: a Meta não permite mensagem livre para abrir conversa de negócio.
//  - Zernio: template é sempre obrigatório (a API recusa com TEMPLATE_REQUIRED).
//  - Meta: se a campanha tem template_name, envia como template; senão mantém o
//    envio de texto livre, que só entrega dentro da janela de 24h.
// Em ambos, os valores das variáveis saem dos placeholders {{...}} de
// message_template, na ordem em que aparecem, renderizados por contato.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GRAPH_VERSION = "v21.0";
const ZERNIO_API = "https://zernio.com/api/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => vars[key] ?? "");
}

/** Valores das variáveis na ordem em que os placeholders aparecem no template. */
function orderedParams(template: string, vars: Record<string, string>): string[] {
  return [...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => vars[m[1]] ?? "");
}

/** Resolve a conta conectada do canal no Zernio (accountId é obrigatório no envio). */
async function zernioAccountId(
  apiKey: string, profileId: string, channel: string,
): Promise<string | null> {
  const url = new URL(`${ZERNIO_API}/accounts`);
  url.searchParams.set("profileId", profileId);
  url.searchParams.set("platform", channel);
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
    if (!userData?.user) return json({ error: "Não autorizado" }, 401);

    const { campaign_id } = await req.json().catch(() => ({}));
    if (!campaign_id) return json({ error: "Informe campaign_id." }, 400);

    const { data: campaign } = await admin
      .from("campaigns")
      .select("id, org_id, message_template, status, channel, provider, template_name, template_language")
      .eq("id", campaign_id)
      .maybeSingle();
    if (!campaign) return json({ error: "Campanha não encontrada" }, 404);
    if (campaign.status === "sending" || campaign.status === "completed") {
      return json({ error: "Campanha já está em envio ou concluída." }, 409);
    }

    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("id", userData.user.id).maybeSingle();
    if (profile?.org_id !== campaign.org_id) return json({ error: "Sem acesso a esta campanha" }, 403);

    const provider = (campaign.provider as string) ?? "meta_official";
    const channel = (campaign.channel as string) ?? "whatsapp";
    if (provider !== "meta_official" && provider !== "zernio") {
      return json({
        error: "Campanhas em massa só são permitidas na API Oficial (Meta) ou no Zernio.",
      }, 400);
    }
    // A Graph API só entrega mensagem de negócio nesses três canais.
    if (provider === "meta_official" && !["whatsapp", "instagram", "facebook"].includes(channel)) {
      return json({
        error: `A API Oficial (Meta) não entrega no canal ${channel}. Use o Zernio.`,
      }, 400);
    }

    // ---- Credenciais do provedor, antes de marcar a campanha como "sending" ----
    let metaConfig: { phone_number_id: string; access_token: string } | null = null;
    let zernio: { apiKey: string; accountId: string } | null = null;

    if (provider === "meta_official") {
      const { data } = await admin
        .from("meta_configs")
        .select("phone_number_id, access_token")
        .eq("org_id", campaign.org_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return json({ error: "Nenhuma instância Meta ativa" }, 400);
      metaConfig = data as { phone_number_id: string; access_token: string };
    } else {
      const { data: config } = await admin
        .from("zernio_configs").select("api_key, profile_id").eq("org_id", campaign.org_id).maybeSingle();
      if (!config) return json({ error: "Zernio não configurado para esta organização." }, 400);

      // Só o WhatsApp exige template: nos demais canais o Zernio abre a conversa
      // com texto livre.
      if (channel === "whatsapp" && (!campaign.template_name || !campaign.template_language)) {
        return json({
          error: "Campanha de WhatsApp pelo Zernio exige um template aprovado — o WhatsApp "
            + "não permite mensagem livre para iniciar conversa.",
        }, 400);
      }

      const accountId = await zernioAccountId(
        config.api_key as string,
        config.profile_id as string,
        channel,
      );
      if (!accountId) {
        return json({ error: `Nenhuma conta de ${channel} conectada no Zernio.` }, 400);
      }
      zernio = { apiKey: config.api_key as string, accountId };
    }

    await admin
      .from("campaigns")
      .update({ status: "sending", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", campaign_id);

    const { data: recipients } = await admin
      .from("campaign_recipients")
      .select("id, phone_number, channel_contact_id, contact:contacts(first_name, company:companies(name))")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients ?? []) {
      const contact = recipient.contact as { first_name?: string; company?: { name?: string } } | null;
      const vars = {
        nome: contact?.first_name ?? "",
        empresa: contact?.company?.name ?? "",
      };
      const text = render(campaign.message_template, vars);
      const params = orderedParams(campaign.message_template, vars);
      // WhatsApp continua endereçando por telefone; os demais canais usam o
      // identificador da plataforma gravado na criação da campanha.
      const destination = channel === "whatsapp"
        ? recipient.phone_number
        : (recipient.channel_contact_id ?? recipient.phone_number);

      let ok = false;
      let errorMsg: unknown = "Falha no envio";

      if (provider === "meta_official") {
        const body = campaign.template_name
          ? {
            messaging_product: "whatsapp",
            to: destination,
            type: "template",
            template: {
              name: campaign.template_name,
              language: { code: campaign.template_language ?? "pt_BR" },
              ...(params.length > 0
                ? {
                  components: [{
                    type: "body",
                    parameters: params.map((v) => ({ type: "text", text: v })),
                  }],
                }
                : {}),
            },
          }
          : {
            messaging_product: "whatsapp",
            to: destination,
            type: "text",
            text: { body: text },
          };

        const resp = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${metaConfig!.phone_number_id}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${metaConfig!.access_token}`,
            },
            body: JSON.stringify(body),
          },
        );
        ok = resp.ok;
        if (!ok) {
          const err = await resp.json().catch(() => ({}));
          errorMsg = err?.error?.error_user_msg ?? err?.error?.message ?? errorMsg;
        }
      } else {
        // Zernio: abre (ou reusa) a conversa. No WhatsApp isso exige template
        // aprovado; nos demais canais vai o texto renderizado.
        const zernioBody: Record<string, unknown> = {
          accountId: zernio!.accountId,
          participantId: destination,
        };
        if (channel === "whatsapp") {
          zernioBody.templateName = campaign.template_name;
          zernioBody.templateLanguage = campaign.template_language;
          if (params.length > 0) zernioBody.templateParams = params;
        } else {
          zernioBody.message = text;
        }

        const resp = await fetch(`${ZERNIO_API}/inbox/conversations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${zernio!.apiKey}`,
          },
          body: JSON.stringify(zernioBody),
        });
        ok = resp.ok;
        if (!ok) {
          const err = await resp.json().catch(() => ({}));
          errorMsg = err?.error ?? errorMsg;
        }
      }

      if (ok) {
        await admin
          .from("campaign_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", recipient.id);
        sent++;
      } else {
        const detail = typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg);
        await admin
          .from("campaign_recipients")
          .update({ status: "failed", error_msg: detail.slice(0, 500) })
          .eq("id", recipient.id);
        failed++;
      }
    }

    await admin
      .from("campaigns")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        sent_count: sent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaign_id);

    return json({ ok: true, provider, sent, failed });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
