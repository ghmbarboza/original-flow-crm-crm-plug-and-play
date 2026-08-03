// Áudio no atendimento: transcrição (STT) e voz (TTS) via ElevenLabs, mais o
// armazenamento dos binários no bucket privado `whatsapp-media`.
//
// Provider único: ElevenLabs, pelo secret ELEVENLABS_API_KEY. Nada aqui é
// exposto ao frontend — as edge functions são as únicas a ler a chave.
//
// Convenção de path do bucket (exigida pelas policies): `<org_id>/...`.
// Todos os helpers devolvem null em falha em vez de lançar: áudio é um extra
// do atendimento, e uma falha de transcrição ou de TTS nunca deve derrubar a
// ingestão da mensagem nem deixar o lead sem resposta.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ELEVEN_API = "https://api.elevenlabs.io/v1";
const BUCKET = "whatsapp-media";

/** Modelos fixos: Scribe para transcrever, multilingual v2 para falar português. */
const STT_MODEL = "scribe_v1";
const TTS_MODEL = "eleven_multilingual_v2";

export function elevenLabsKey(): string | null {
  return Deno.env.get("ELEVENLABS_API_KEY") ?? null;
}

/**
 * Chave do ElevenLabs a usar para uma organização.
 *
 * Primeiro a chave própria da org (Vault, via `api_keys_registry` + a função
 * `get_org_api_key`, acessível só com service_role); se ela não existir, cai na
 * chave da plataforma (env) — é o que mantém as demos funcionando.
 */
export async function resolverChaveElevenLabs(
  admin: SupabaseClient,
  orgId: string | null | undefined,
): Promise<string | null> {
  if (orgId) {
    try {
      const { data, error } = await admin.rpc("get_org_api_key", {
        _org_id: orgId,
        _service: "elevenlabs",
      });
      if (error) {
        console.error("[audio] falha ao ler chave da org:", error.message);
      } else if (typeof data === "string" && data.trim()) {
        return data.trim();
      }
    } catch (err) {
      console.error("[audio] erro ao ler chave da org:", err instanceof Error ? err.message : err);
    }
  }
  return elevenLabsKey();
}

/** Extensão a partir do mimetype do provedor, com fallback para ogg (PTT do WhatsApp). */
export function extensaoDeAudio(mimetype: string | null | undefined): string {
  const mime = (mimetype ?? "").split(";")[0].trim().toLowerCase();
  const mapa: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
  };
  return mapa[mime] ?? "ogg";
}

/** Decodifica base64 (formato em que a Evolution entrega a mídia) para bytes. */
export function base64ParaBytes(base64: string): Uint8Array {
  // Aceita data URLs — a Evolution às vezes devolve com o prefixo.
  const limpo = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const bin = atob(limpo);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Codifica bytes em base64 em blocos.
 *
 * `btoa(String.fromCharCode(...bytes))` estoura a pilha com áudio de poucos
 * segundos — o spread vira um argumento por byte.
 */
export function bytesParaBase64(bytes: Uint8Array): string {
  let bin = "";
  const bloco = 8192;
  for (let i = 0; i < bytes.length; i += bloco) {
    bin += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return btoa(bin);
}

/**
 * Transcreve um áudio com o ElevenLabs Scribe.
 * Devolve null (e loga) quando a chave falta ou a API recusa.
 */
export async function transcreverAudio(
  bytes: Uint8Array,
  mimetype: string,
  chave?: string | null,
): Promise<string | null> {
  const key = chave ?? elevenLabsKey();
  if (!key) {
    console.error("[audio] sem chave do ElevenLabs (org ou plataforma) — áudio salvo sem transcrição.");
    return null;
  }

  const form = new FormData();
  // O nome do arquivo precisa refletir o container real: a API infere o
  // formato pela extensão e recusa quando ela mente sobre os bytes.
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mimetype }), `audio.${extensaoDeAudio(mimetype)}`);
  form.append("model_id", STT_MODEL);

  try {
    const resp = await fetch(`${ELEVEN_API}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!resp.ok) {
      console.error(`[audio] Scribe recusou a transcrição [${resp.status}]: ${(await resp.text()).slice(0, 300)}`);
      return null;
    }
    const data = await resp.json().catch(() => ({}));
    const texto = typeof data?.text === "string" ? data.text.trim() : "";
    return texto || null;
  } catch (err) {
    console.error("[audio] falha ao transcrever:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Gera o áudio da resposta (mp3) com o ElevenLabs. Null em qualquer falha. */
export async function gerarAudioDaResposta(
  texto: string,
  voiceId: string,
  chave?: string | null,
): Promise<Uint8Array | null> {
  const key = chave ?? elevenLabsKey();
  if (!key) {
    console.error("[audio] sem chave do ElevenLabs (org ou plataforma) — resposta seguirá em texto.");
    return null;
  }
  if (!voiceId) {
    console.error("[audio] voice_id não configurado — resposta seguirá em texto.");
    return null;
  }

  try {
    // output_format é query param, não campo do corpo.
    const resp = await fetch(
      `${ELEVEN_API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text: texto, model_id: TTS_MODEL }),
      },
    );
    if (!resp.ok) {
      console.error(`[audio] TTS recusado [${resp.status}]: ${(await resp.text()).slice(0, 300)}`);
      return null;
    }
    return new Uint8Array(await resp.arrayBuffer());
  } catch (err) {
    console.error("[audio] falha no TTS:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Sobe o áudio no bucket privado e devolve o PATH (não a URL).
 *
 * O path é o que fica em `conversation_messages.media_url`: URL assinada tem
 * validade curta e não serve para guardar. Quem exibe assina na hora.
 */
export async function salvarAudioNoBucket(
  admin: SupabaseClient,
  orgId: string,
  conversationId: string,
  bytes: Uint8Array,
  nomeArquivo: string,
  contentType: string,
): Promise<string | null> {
  const path = `${orgId}/audio/${conversationId}/${nomeArquivo}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error(`[audio] falha ao subir ${path}: ${error.message}`);
    return null;
  }
  return path;
}

/** Baixa a mídia de uma URL autenticada (Graph API da Meta, por exemplo). */
export async function baixarBinario(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ bytes: Uint8Array; mimetype: string } | null> {
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      console.error(`[audio] download recusado [${resp.status}]: ${url.slice(0, 120)}`);
      return null;
    }
    return {
      bytes: new Uint8Array(await resp.arrayBuffer()),
      mimetype: resp.headers.get("content-type") ?? "audio/ogg",
    };
  } catch (err) {
    console.error("[audio] falha no download:", err instanceof Error ? err.message : err);
    return null;
  }
}
