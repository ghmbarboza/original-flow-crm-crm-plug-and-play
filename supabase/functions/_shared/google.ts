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

/** Garante um access_token válido, renovando pelo refresh_token quando expirado. */
export async function getValidAccessToken(admin: Admin, conn: GmailConnection): Promise<string | null> {
  const expired = !conn.token_expiry || new Date(conn.token_expiry).getTime() < Date.now() + 60_000;
  if (!expired && conn.access_token) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
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
