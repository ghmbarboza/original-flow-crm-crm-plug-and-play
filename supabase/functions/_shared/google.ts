// Helpers compartilhados para as edge functions do Gmail.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Admin = ReturnType<typeof createClient>;

export interface GmailConnection {
  id: string;
  org_id: string;
  user_id: string;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
}


/**
 * Credenciais OAuth do Google usadas pela organização.
 *
 * Vinham só de `Deno.env`, o que exigia alguém com acesso aos secrets do
 * Supabase para cada cliente que fosse usar e-mail — na prática o botão
 * "Conectar Gmail" só respondia "GOOGLE_CLIENT_ID não configurado", sem
 * caminho nenhum na interface. Agora saem do Vault da própria organização,
 * pelo mesmo mecanismo da chave do ElevenLabs, e o env fica como fallback para
 * quem já configurava assim.
 */
export async function resolverCredenciaisGoogle(
  admin: Admin,
  orgId: string | null | undefined,
): Promise<{ clientId: string | null; clientSecret: string | null }> {
  const doVault = async (servico: string): Promise<string | null> => {
    if (!orgId) return null;
    try {
      const { data, error } = await admin.rpc("get_org_api_key", {
        _org_id: orgId,
        _service: servico,
      });
      if (error) {
        console.error(`[google] falha ao ler ${servico} da org: ${error.message}`);
        return null;
      }
      return typeof data === "string" && data.trim() ? data.trim() : null;
    } catch (err) {
      console.error(`[google] erro ao ler ${servico}:`, err instanceof Error ? err.message : err);
      return null;
    }
  };

  return {
    clientId: (await doVault("google_client_id")) ?? Deno.env.get("GOOGLE_CLIENT_ID") ?? null,
    clientSecret: (await doVault("google_client_secret")) ?? Deno.env.get("GOOGLE_CLIENT_SECRET") ?? null,
  };
}

/** Garante um access_token válido, renovando pelo refresh_token quando expirado. */
export async function getValidAccessToken(admin: Admin, conn: GmailConnection): Promise<string | null> {
  const expired = !conn.token_expiry || new Date(conn.token_expiry).getTime() < Date.now() + 60_000;
  if (!expired && conn.access_token) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token;

  const { clientId, clientSecret } = await resolverCredenciaisGoogle(admin, conn.org_id);
  if (!clientId || !clientSecret) return conn.access_token;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) return conn.access_token;
  const tokens = await resp.json();
  const expiry = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
  await admin
    .from("email_connections")
    .update({ access_token: tokens.access_token, token_expiry: expiry })
    .eq("id", conn.id);
  return tokens.access_token ?? conn.access_token;
}

/** Base64url → texto (para o corpo das mensagens do Gmail). */
export function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}
