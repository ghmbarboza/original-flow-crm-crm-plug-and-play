// Provas de origem usadas pelas functions que não recebem login de usuário.
//
// POR QUE ISSO EXISTE: a Lovable publica todas as functions com verify_jwt=false,
// então o `config.toml` não protege nada no ar. Cada function sem usuário tem
// que provar sozinha quem está chamando: o cron (segredo interno no Vault), outra
// function (service role) ou o fornecedor (assinatura ou token do webhook).
// Só precisa do rpc; tipar pelo createClient genérico briga com o client
// "public" de cada function.
type Admin = { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Comparação em tempo constante (não vaza o prefixo certo pelo tempo de resposta). */
export function iguais(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * O cron manda `x-cron-secret` com o valor guardado no Vault
 * (`internal_cron_secret`, migration 20260914100000).
 */
export async function cronAutorizado(req: Request, admin: Admin): Promise<boolean> {
  const recebido = req.headers.get("x-cron-secret") ?? "";
  if (!recebido) return false;
  const { data, error } = await admin.rpc("internal_cron_secret");
  if (error || typeof data !== "string" || !data) {
    console.error(`[seguranca] segredo interno indisponível: ${error?.message ?? "vazio"}`);
    return false;
  }
  return iguais(recebido, data);
}

/** Chamada de outra function do projeto, que manda a service role no Authorization. */
export function chamadaInterna(req: Request): boolean {
  const esperado = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const recebido = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return !!esperado && iguais(recebido, esperado);
}

export function naoAutorizado() {
  return new Response(JSON.stringify({ error: "Não autorizado" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
