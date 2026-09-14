// Webhook público da WhatsApp Cloud API (Meta).
//
// GET  → verificação do webhook (hub.challenge) contra o verify token da
//        organização (meta_configs.webhook_verify_token, exibido no setup).
// POST → mensagens recebidas: resolve a instância pelo phone_number_id, confere a
//        assinatura X-Hub-Signature-256 com o App Secret dessa instância, cria/
//        atualiza contato e conversa, grava a mensagem e dispara a IA.
//
// Antes o GET dependia de um secret de ambiente que nunca foi cadastrado (a
// verificação no painel da Meta falhava sempre) e o POST aceitava qualquer corpo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hmacSha256Hex, iguais } from "../_shared/seguranca.ts";
import { obterOuCriarContatoWhatsapp, obterOuCriarConversa } from "../_shared/conversa.ts";
import {
  baixarBinario, extensaoDeAudio, resolverChaveElevenLabs, salvarAudioNoBucket, transcreverAudio,
} from "../_shared/audio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: unknown = { received: true }) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

/**
 * Resolve e baixa uma mídia da Graph API: primeiro o GET do id devolve a URL
 * temporária, depois o download exige o mesmo access token da config.
 */
async function baixarMidiaMeta(
  mediaId: string,
  accessToken: string,
): Promise<{ bytes: Uint8Array; mimetype: string } | null> {
  try {
    const metaResp = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaResp.ok) {
      console.error(`[meta] mídia ${mediaId} não resolvida [${metaResp.status}]: ${(await metaResp.text()).slice(0, 300)}`);
      return null;
    }
    const meta = await metaResp.json().catch(() => ({}));
    if (!meta?.url) {
      console.error(`[meta] mídia ${mediaId} sem url no retorno.`);
      return null;
    }
    const baixado = await baixarBinario(meta.url as string, {
      Authorization: `Bearer ${accessToken}`,
    });
    if (!baixado) return null;
    return { bytes: baixado.bytes, mimetype: (meta.mime_type as string) ?? baixado.mimetype };
  } catch (err) {
    console.error("[meta] falha ao baixar mídia:", err instanceof Error ? err.message : err);
    return null;
  }
}

function triggerAI(conversationId: string) {
  const call = fetch(`${SUPABASE_URL}/functions/v1/ai-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ conversation_id: conversationId }),
  }).catch(() => {});
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(call);
  return call;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Verificação do webhook.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token) {
      const { data: dono } = await admin
        .from("meta_configs").select("id").eq("webhook_verify_token", token).limit(1).maybeSingle();
      if (dono) {
        await admin.from("meta_configs").update({ webhook_verified: true }).eq("id", dono.id);
        return new Response(challenge ?? "", { status: 200 });
      }
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return ok();

  const rawBody = await req.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = JSON.parse(rawBody); } catch { return ok({ ignored: "corpo inválido" }); }

  // A Meta assina o corpo inteiro com o App Secret. Cada App Secret é checado
  // uma vez por requisição, mesmo com várias mensagens no mesmo corpo.
  const assinatura = (req.headers.get("X-Hub-Signature-256") ?? "").replace(/^sha256=/, "");
  const conferidas = new Map<string, boolean>();
  const assinaturaValida = async (appSecret: string | null) => {
    if (!appSecret || !assinatura) return false;
    if (!conferidas.has(appSecret)) {
      conferidas.set(appSecret, iguais(assinatura, await hmacSha256Hex(appSecret, rawBody)));
    }
    return conferidas.get(appSecret)!;
  };

  // Estrutura: entry[].changes[].value.{ metadata.phone_number_id, contacts, messages }
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneNumberId: string = value.metadata?.phone_number_id ?? "";
      const messages = value.messages ?? [];
      if (!phoneNumberId || messages.length === 0) continue;

      const { data: instance } = await admin
        .from("meta_configs")
        .select("id, org_id, access_token, app_secret")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();
      if (!instance) continue;
      if (!(await assinaturaValida(instance.app_secret as string | null))) {
        console.error(
          `[meta] assinatura ${instance.app_secret ? "inválida" : "sem App Secret cadastrado"} ` +
          `para o número ${phoneNumberId}; mensagens descartadas`,
        );
        return new Response(JSON.stringify({ error: "Assinatura inválida" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const orgId = instance.org_id;
      const profileName = value.contacts?.[0]?.profile?.name ?? null;

      for (const msg of messages) {
        const phone: string = msg.from ?? "";
        const textoRecebido: string = msg.text?.body ?? msg.button?.text ?? msg.interactive?.list_reply?.title ?? "";
        // Áudio (nota de voz ou arquivo de áudio): a Meta manda só o id da mídia.
        const audioId: string | null = msg.type === "audio" ? (msg.audio?.id ?? null) : null;
        if (!phone || (!textoRecebido && !audioId)) continue;

        // Preview antes da transcrição: o áudio precisa aparecer na lista mesmo
        // se a transcrição falhar depois.
        const preview = textoRecebido ? textoRecebido.slice(0, 120) : "🎤 Áudio";

        // Contato e conversa, à prova de rajada (ver _shared/conversa.ts).
        const contato = await obterOuCriarContatoWhatsapp(admin, orgId, phone, {
          first_name: profileName ?? phone,
          status: "lead",
          source: "whatsapp",
        });
        const contactId = contato?.id ?? null;

        const conversa = await obterOuCriarConversa(admin, { org_id: orgId, phone_number: phone }, async () => {
          // Distribuição por canal: pré-atribui um agente elegível (round-robin) ou null.
          const { data: assignedTo } = await admin.rpc("pick_agent_for_channel", {
            p_org: orgId,
            p_channel: "whatsapp",
          });
          return {
            contact_id: contactId,
            provider: "meta_official",
            status: "ai_active",
            assigned_to: assignedTo ?? null,
            last_message_at: new Date().toISOString(),
            last_message_preview: preview,
            unread_count: 1,
          };
        });
        // Sem conversa não há onde gravar: 500 faz a Meta reentregar, em vez de
        // 200 com a mensagem perdida.
        if (!conversa) {
          return new Response(JSON.stringify({ error: "falha ao registrar a conversa" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const conversationId = conversa.id;
        const status = conversa.status;
        const existingConversation = conversa.criada ? null : conversa;
        if (!conversa.criada) {
          await admin
            .from("conversations")
            .update({
              contact_id: contactId,
              last_message_at: new Date().toISOString(),
              last_message_preview: preview,
              unread_count: conversa.unread_count + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversationId);
        }

        // Áudio: baixa, guarda no bucket e transcreve. A transcrição vai em
        // `content`, de modo que o histórico lido pela IA segue textual. Falha de
        // download ou transcrição nunca descarta a mensagem.
        let transcricao: string | null = null;
        if (audioId) {
          const midia = await baixarMidiaMeta(audioId, instance.access_token as string);
          let mediaPath: string | null = null;
          if (midia) {
            mediaPath = await salvarAudioNoBucket(
              admin, orgId, conversationId, midia.bytes,
              `${Date.now()}.${extensaoDeAudio(midia.mimetype)}`, midia.mimetype,
            );
            transcricao = await transcreverAudio(
              midia.bytes, midia.mimetype, await resolverChaveElevenLabs(admin, orgId),
            );
          }

          await admin.from("conversation_messages").insert({
            conversation_id: conversationId,
            org_id: orgId,
            direction: "inbound",
            content: transcricao,
            media_url: mediaPath,
            provider_message_id: msg.id ?? null,
            type: "audio",
            status: "received",
          });

          if (transcricao) {
            await admin
              .from("conversations")
              .update({ last_message_preview: transcricao.slice(0, 120) })
              .eq("id", conversationId);
          }
        } else {
          await admin.from("conversation_messages").insert({
            conversation_id: conversationId,
            org_id: orgId,
            direction: "inbound",
            content: textoRecebido,
            provider_message_id: msg.id ?? null,
            type: "text",
            status: "received",
          });
        }

        // Lead scoring por canal. Sem regra ativa a função não faz nada.
        if (contactId) {
          if (!existingConversation) {
            await admin.rpc("apply_lead_score", {
              p_org: orgId, p_contact: contactId,
              p_event: "conversation_started", p_channel: "whatsapp",
            });
          }
          await admin.rpc("apply_lead_score", {
            p_org: orgId, p_contact: contactId,
            p_event: "message_received", p_channel: "whatsapp",
          });
        }

        // Áudio sem transcrição não dispara a IA: não há texto para ela ler.
        if (status === "ai_active" && (!audioId || transcricao)) {
          const call = triggerAI(conversationId);
          const runtime = (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
          if (!runtime) await call;
        }
      }
    }
  }

  return ok();
});
