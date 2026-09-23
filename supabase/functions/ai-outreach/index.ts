// Abordagem ativa pela IA: primeira mensagem de WhatsApp para um contato que
// ainda não conversou com a empresa (lead de formulário, importação, cadastro).
//
// Quem chama é o automation-dispatcher (ação "ai_outreach"), com o segredo
// interno. O fluxo:
//  1. contato com telefone, IA ligada, canal de WhatsApp conectado;
//  2. sem conversa anterior com mensagens (quem já falou não é "abordado");
//  3. Evolution: a IA escreve o texto de abertura e ele sai na hora, ou fica
//     agendado para a próxima abertura do horário de atendimento;
//     Meta e Zernio: a Meta só aceita template aprovado para iniciar conversa,
//     então sai o template configurado em IA > Abordagem ativa;
//  4. conversa criada com status ai_active: a resposta do lead cai no webhook
//     do canal, casa por telefone e a IA continua a partir dali;
//  5. tudo fica na linha do tempo: mensagem enviada e anotação da IA.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarIA, ErroIA } from "../_shared/ai.ts";
import { chamadaInterna, naoAutorizado } from "../_shared/seguranca.ts";
import { dentroDoHorario, proximaAbertura } from "../_shared/horario.ts";
import { obterOuCriarConversa } from "../_shared/conversa.ts";
import { garantirNegocioAberto, registrarNotaIA } from "../_shared/negocio.ts";

const ZERNIO_API = "https://zernio.com/api/v1";
const GRAPH_VERSION = "v21.0";
const MAX_TOKENS_ABERTURA = 400;
const PREVIEW_MAX = 120;

const INSTRUCAO_PADRAO =
  "Apresente-se, diga que recebeu o contato dele, mostre que sabe do que ele precisa e faça uma pergunta curta para começar a conversa.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Só dígitos, com DDI 55 quando o número veio sem código do país (formato do Evolution/Meta). */
function normalizarTelefone(bruto: string | null | undefined): string | null {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  if (digitos.length <= 11) return `55${digitos}`;
  return digitos;
}

interface OutreachConfig {
  instruction?: string;
  template_name?: string | null;
  template_language?: string | null;
  /** Variáveis do template, na ordem: "nome" e/ou "empresa". */
  template_params?: string[];
}

type Provedor = "evolution" | "meta_official" | "zernio";

interface Canal {
  provider: Provedor;
  evolution?: { server_url: string; api_key: string; instance_name: string };
  meta?: { phone_number_id: string; access_token: string };
  zernio?: { api_key: string; profile_id: string };
}

/** Primeiro canal de WhatsApp conectado, na ordem em que o CRM os prefere. */
async function resolverCanal(admin: SupabaseClient, orgId: string): Promise<Canal | null> {
  const { data: evo } = await admin
    .from("evolution_configs").select("server_url, api_key, instance_name")
    .eq("org_id", orgId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (evo) return { provider: "evolution", evolution: evo as Canal["evolution"] };

  const { data: meta } = await admin
    .from("meta_configs").select("phone_number_id, access_token")
    .eq("org_id", orgId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (meta) return { provider: "meta_official", meta: meta as Canal["meta"] };

  const { data: zernio } = await admin
    .from("zernio_configs").select("api_key, profile_id, active_channels, status")
    .eq("org_id", orgId).maybeSingle();
  if (zernio && zernio.status === "active" && (zernio.active_channels as string[] | null ?? []).includes("whatsapp")) {
    return { provider: "zernio", zernio: zernio as Canal["zernio"] };
  }
  return null;
}

async function zernioAccountId(apiKey: string, profileId: string): Promise<string | null> {
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

interface Envio {
  ok: boolean;
  providerMessageId: string | null;
  providerConversationId: string | null;
  motivo?: string;
}

async function enviarTexto(canal: Canal, telefone: string, texto: string): Promise<Envio> {
  if (canal.provider !== "evolution" || !canal.evolution) {
    return { ok: false, providerMessageId: null, providerConversationId: null, motivo: "texto livre só no Evolution" };
  }
  const resp = await fetch(`${canal.evolution.server_url}/message/sendText/${canal.evolution.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: canal.evolution.api_key },
    body: JSON.stringify({ number: telefone, text: texto }),
  });
  if (!resp.ok) {
    return { ok: false, providerMessageId: null, providerConversationId: null, motivo: `Evolution respondeu ${resp.status}` };
  }
  const result = await resp.json().catch(() => ({}));
  return { ok: true, providerMessageId: result?.key?.id ?? null, providerConversationId: null };
}

async function enviarTemplate(
  canal: Canal,
  telefone: string,
  outreach: OutreachConfig,
  params: string[],
): Promise<Envio> {
  const nome = outreach.template_name!;
  const idioma = outreach.template_language || "pt_BR";

  if (canal.provider === "meta_official" && canal.meta) {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${canal.meta.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${canal.meta.access_token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefone,
        type: "template",
        template: {
          name: nome,
          language: { code: idioma },
          ...(params.length > 0
            ? { components: [{ type: "body", parameters: params.map((v) => ({ type: "text", text: v })) }] }
            : {}),
        },
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { ok: false, providerMessageId: null, providerConversationId: null, motivo: err?.error?.error_user_msg ?? err?.error?.message ?? `Meta respondeu ${resp.status}` };
    }
    const result = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: result?.messages?.[0]?.id ?? null, providerConversationId: null };
  }

  if (canal.provider === "zernio" && canal.zernio) {
    const accountId = await zernioAccountId(canal.zernio.api_key, canal.zernio.profile_id);
    if (!accountId) return { ok: false, providerMessageId: null, providerConversationId: null, motivo: "nenhuma conta de WhatsApp conectada no Zernio" };
    const resp = await fetch(`${ZERNIO_API}/inbox/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${canal.zernio.api_key}` },
      body: JSON.stringify({
        accountId,
        participantId: telefone,
        templateName: nome,
        templateLanguage: idioma,
        ...(params.length > 0 ? { templateParams: params } : {}),
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { ok: false, providerMessageId: null, providerConversationId: null, motivo: typeof err?.error === "string" ? err.error : `Zernio respondeu ${resp.status}` };
    }
    const result = await resp.json().catch(() => ({}));
    const conversa = result?.conversation ?? result;
    return {
      ok: true,
      providerMessageId: result?.message?._id ?? result?.messageId ?? null,
      providerConversationId: conversa?._id ?? conversa?.id ?? result?.conversationId ?? null,
    };
  }

  return { ok: false, providerMessageId: null, providerConversationId: null, motivo: "canal sem envio de template" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!chamadaInterna(req)) return naoAutorizado();

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const orgId = String(body.org_id ?? "");
    const contactId = String(body.contact_id ?? "");
    const dealIdPedido = body.deal_id ? String(body.deal_id) : null;
    const instrucaoDaAcao = String(body.instruction ?? "").trim();
    const origem = String(body.origem ?? "Abordagem ativa").slice(0, 120);
    if (!orgId || !contactId) return json({ error: "Informe org_id e contact_id." }, 400);

    // 1. Contato, IA e canal.
    const { data: contact } = await admin
      .from("contacts")
      .select("id, first_name, last_name, phone, whatsapp_phone, email, source, custom_fields, is_demo, merged_into_id, company:companies(name)")
      .eq("id", contactId).eq("org_id", orgId).maybeSingle();
    if (!contact) return json({ error: "Contato não encontrado" }, 404);
    if (contact.is_demo) return json({ skipped: "contato de demonstração" });
    if (contact.merged_into_id) return json({ skipped: "contato mesclado em outro" });

    const telefone = normalizarTelefone(contact.whatsapp_phone) ?? normalizarTelefone(contact.phone);
    if (!telefone) return json({ error: "Contato sem telefone de WhatsApp" }, 422);

    const { data: config } = await admin
      .from("ai_messaging_config")
      .select("is_active, agent_name, agent_tone, agent_objective, system_prompt, working_hours, outreach")
      .eq("org_id", orgId).maybeSingle();
    if (!config || !config.is_active) return json({ error: "Atendimento por IA desativado nesta organização" }, 422);
    const outreach = (config.outreach ?? {}) as OutreachConfig;

    const canal = await resolverCanal(admin, orgId);
    if (!canal) return json({ error: "Nenhum canal de WhatsApp conectado" }, 422);

    // 2. Quem já conversou não é abordado: a IA responde, não interrompe. Uma
    //    abordagem agendada (fora do horário) também conta: duas automações
    //    mirando o mesmo lead não podem gerar duas aberturas.
    const jaAbordado = async (): Promise<string | null> => {
      const { data: existente } = await admin
        .from("conversations").select("id, status")
        .eq("org_id", orgId).eq("phone_number", telefone).limit(1).maybeSingle();
      if (existente) {
        const { count } = await admin
          .from("conversation_messages").select("id", { count: "exact", head: true })
          .eq("conversation_id", existente.id).eq("is_internal_note", false);
        if ((count ?? 0) > 0) return "contato já tem conversa com mensagens";
        if (existente.status === "closed") return "conversa encerrada";
      }
      const { count: agendadas } = await admin
        .from("scheduled_messages").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("contact_id", contactId).eq("status", "pending");
      if ((agendadas ?? 0) > 0) return "abordagem já agendada para este contato";
      return null;
    };
    const motivoPular = await jaAbordado();
    if (motivoPular) return json({ skipped: motivoPular });

    const { data: org } = await admin
      .from("organizations")
      .select("name, timezone, business_description, target_audience, main_problem_solved, brand_tone, ai_prohibitions")
      .eq("id", orgId).maybeSingle();
    const timezone = (org?.timezone as string) || "America/Sao_Paulo";

    const nome = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
    const primeiroNome = (contact.first_name as string | null)?.trim() || "";
    const empresa = ((contact.company as { name?: string } | null)?.name ?? "").trim();

    // 3. Texto de abertura.
    let texto: string;
    let viaTemplate = false;
    const params = (outreach.template_params ?? []).map((p) => p === "empresa" ? empresa : primeiroNome || nome);
    if (canal.provider === "evolution") {
      const campos = Object.entries((contact.custom_fields as Record<string, unknown> | null) ?? {})
        .filter(([, v]) => typeof v === "string" && v.trim())
        .map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`)
        .slice(0, 8);
      const system = [
        (config.system_prompt as string | null)?.trim() || "",
        `Você é ${config.agent_name}, atendente virtual de ${org?.name ?? "nossa empresa"}. Tom: ${config.agent_tone}. Objetivo: ${config.agent_objective}.`,
        org?.business_description ? `Sobre a empresa: ${org.business_description}` : "",
        org?.ai_prohibitions ? `Nunca: ${org.ai_prohibitions}` : "",
        "",
        "Tarefa: escrever a PRIMEIRA mensagem de WhatsApp para este contato, que ainda não conversou com a empresa.",
        instrucaoDaAcao || (outreach.instruction ?? "").trim() || INSTRUCAO_PADRAO,
        "",
        `Contato: ${nome || "sem nome"}${empresa ? `, da empresa ${empresa}` : ""}. Origem: ${contact.source ?? "cadastro"}.`,
        campos.length ? "O que ele informou:\n" + campos.join("\n") : "",
        "",
        "Regras: português do Brasil, no máximo 3 frases curtas, sem assunto, sem assinatura formal, sem inventar dados. Responda apenas com o texto da mensagem.",
      ].filter(Boolean).join("\n");
      const { texto: gerado } = await chamarIA({
        tarefa: "chat",
        maxTokens: MAX_TOKENS_ABERTURA,
        system,
        messages: [{ role: "user", content: "Escreva a mensagem de abertura." }],
      });
      texto = gerado.trim().replace(/^["“]|["”]$/g, "");
      if (!texto) return json({ error: "A IA não gerou a mensagem de abertura" }, 502);
    } else {
      if (!outreach.template_name) {
        return json({ error: "Meta e Zernio exigem template aprovado para iniciar conversa. Configure em IA > Abordagem ativa." }, 422);
      }
      viaTemplate = true;
      texto = `Template "${outreach.template_name}"${params.length ? ` (${params.join(", ")})` : ""}`;
    }

    // 4. Negócio e conversa.
    const dealId = dealIdPedido ?? await garantirNegocioAberto(admin, orgId, contactId, nome || telefone);
    if (!contact.whatsapp_phone) {
      // Sem isso a resposta do lead criaria um segundo contato pelo webhook.
      await admin.from("contacts").update({ whatsapp_phone: telefone }).eq("id", contactId).is("whatsapp_phone", null);
    }
    const conversa = await obterOuCriarConversa(
      admin,
      { org_id: orgId, phone_number: telefone, ...(canal.provider === "zernio" ? { channel: "whatsapp" } : {}) },
      async () => {
        const { data: assignedTo } = await admin.rpc("pick_agent_for_channel", { p_org: orgId, p_channel: "whatsapp" });
        return {
          contact_id: contactId,
          deal_id: dealId,
          provider: canal.provider,
          channel: "whatsapp",
          channel_contact_name: nome || null,
          status: "ai_active",
          assigned_to: assignedTo ?? null,
          unread_count: 0,
        };
      },
    );
    if (!conversa) return json({ error: "Não foi possível abrir a conversa" }, 500);
    // Reconfere depois de gerar o texto e abrir a conversa: estreita a janela em
    // que duas chamadas simultâneas passariam pela guarda inicial.
    const motivoPularAgora = await jaAbordado();
    if (motivoPularAgora) return json({ skipped: motivoPularAgora, conversation_id: conversa.id });

    // 5. Fora do horário: texto livre espera a próxima abertura. Template da
    //    Meta é mensagem de negócio permitida a qualquer hora e sai agora.
    if (!viaTemplate && !dentroDoHorario(config.working_hours, timezone)) {
      const quando = proximaAbertura(config.working_hours, timezone);
      const { error } = await admin.from("scheduled_messages").insert({
        org_id: orgId, contact_id: contactId, conversation_id: conversa.id, deal_id: dealId,
        message: texto, channel: "whatsapp", scheduled_at: quando.toISOString(), status: "pending",
      });
      if (error) return json({ error: `Não foi possível agendar: ${error.message}` }, 500);
      await registrarNotaIA(admin, {
        orgId, contactId, dealId,
        titulo: "IA agendou a abordagem pelo WhatsApp",
        corpo: `${origem}. Sai em ${quando.toISOString()} (fora do horário de atendimento).\n\n${texto}`,
      });
      return json({ ok: true, scheduled_at: quando.toISOString(), conversation_id: conversa.id, content: texto });
    }

    // 6. Envio e registro.
    const envio = viaTemplate
      ? await enviarTemplate(canal, telefone, outreach, params)
      : await enviarTexto(canal, telefone, texto);

    const agora = new Date().toISOString();
    await admin.from("conversation_messages").insert({
      conversation_id: conversa.id,
      org_id: orgId,
      direction: "outbound",
      content: texto,
      is_from_ai: true,
      provider_message_id: envio.providerMessageId,
      type: "text",
      status: envio.ok ? "sent" : "failed",
    });
    await admin.from("conversations").update({
      last_message_at: agora,
      last_message_preview: texto.slice(0, PREVIEW_MAX),
      updated_at: agora,
      ...(envio.providerConversationId ? { provider_conversation_id: envio.providerConversationId } : {}),
    }).eq("id", conversa.id);

    if (!envio.ok) {
      await registrarNotaIA(admin, {
        orgId, contactId, dealId,
        titulo: "Abordagem pelo WhatsApp falhou",
        corpo: `${origem}. ${envio.motivo ?? "O canal não aceitou o envio."}`,
      });
      return json({ error: envio.motivo ?? "O canal não aceitou o envio", conversation_id: conversa.id }, 502);
    }

    await registrarNotaIA(admin, {
      orgId, contactId, dealId,
      titulo: "IA abordou o lead pelo WhatsApp",
      corpo: `${origem}.\n\n${texto}`,
    });
    return json({ ok: true, sent: true, conversation_id: conversa.id, content: texto, provider: canal.provider });
  } catch (err) {
    if (err instanceof ErroIA) return json({ error: err.publico }, err.status);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
