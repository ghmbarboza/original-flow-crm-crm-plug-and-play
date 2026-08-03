// Reescreve um texto curto de configuração para ficar mais claro e específico.
//
// Usada pelo botão "Melhorar com IA" ao lado dos campos livres que alimentam a
// geração do prompt (o que a empresa vende, público, problema resolvido…).
// Quanto melhor esse texto, melhor todo o resto — mas ele não pode INVENTAR:
// número, cliente ou capacidade que o usuário não escreveu viraria promessa
// falsa dita pela IA ao cliente final. Daí a regra explícita no prompt.
//
// Não persiste nada: devolve o texto e o frontend deixa o usuário desfazer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarIA, ErroIA } from "../_shared/ai.ts";

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

const MIN_CHARS = 10;
const MAX_ENTRADA = 2000;
/** Teto do limite pedido pelo cliente: evita gerar texto longo por engano. */
const MAX_CHARS_TETO = 1000;

function promptDeMelhoria(texto: string, contexto: string, maxChars: number): string {
  return `Reescreva o texto abaixo em português brasileiro.

O QUE O CAMPO REPRESENTA: ${contexto}

TEXTO ORIGINAL:
${texto}

REGRAS
- Deixe claro, específico e comercialmente atraente, sem soar publicitário exagerado.
- NÃO INVENTE FATOS. Não crie números, prazos, preços, nomes de clientes, prêmios,
  tecnologias ou capacidades que não estejam no texto original. Se o original é
  vago, deixe-o mais bem escrito — não o complete com informação nova.
- Mantenha o sentido e o ponto de vista do original.
- No máximo ${maxChars} caracteres, contando espaços.
- Sem markdown, sem aspas em volta, sem título, sem explicação.

Responda SOMENTE com o texto reescrito.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Recurso pago de IA: exige sessão. Sem isso, qualquer um consumiria os
    // créditos do projeto chamando a function direto.
    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader
      ? await admin.auth.getUser(authHeader.replace("Bearer ", ""))
      : { data: { user: null } };
    if (!userData?.user) return json({ error: "Não autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const texto = String(body?.text ?? "").trim();
    const contexto = String(body?.field_context ?? "").trim() || "um campo de texto livre da configuração";
    const pedido = Number(body?.max_chars);
    const maxChars = Number.isFinite(pedido) && pedido > 0
      ? Math.min(Math.trunc(pedido), MAX_CHARS_TETO)
      : 300;

    if (texto.length < MIN_CHARS) {
      return json({ error: `Escreva ao menos ${MIN_CHARS} caracteres antes de melhorar.` }, 400);
    }
    if (texto.length > MAX_ENTRADA) {
      return json({ error: "O texto é longo demais para melhorar automaticamente." }, 400);
    }

    const { texto: bruto } = await chamarIA({
      tarefa: "chat",
      // Folga sobre o limite de caracteres: o modelo conta tokens, não chars.
      maxTokens: Math.min(2000, Math.ceil(maxChars / 2) + 300),
      messages: [{ role: "user", content: promptDeMelhoria(texto, contexto, maxChars) }],
    });

    // Modelos gostam de devolver o texto entre aspas ou em bloco de código.
    let melhorado = bruto.trim()
      .replace(/^```[a-z]*\s*/i, "")
      .replace(/```$/, "")
      .trim()
      .replace(/^["“'](.*)["”']$/s, "$1")
      .trim();

    if (!melhorado) {
      return json({ error: "A IA não devolveu um texto. Tente novamente." }, 502);
    }

    // Corta na última fronteira de palavra para não devolver palavra partida.
    if (melhorado.length > maxChars) {
      const cortado = melhorado.slice(0, maxChars);
      const ultimoEspaco = cortado.lastIndexOf(" ");
      melhorado = (ultimoEspaco > maxChars * 0.6 ? cortado.slice(0, ultimoEspaco) : cortado).trim();
    }

    return json({ ok: true, text: melhorado });
  } catch (err) {
    if (err instanceof ErroIA) return json({ error: err.publico }, err.status);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
