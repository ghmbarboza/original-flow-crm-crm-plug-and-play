// Assistente do CRM (25/09/2026). Agente dentro do app que responde sobre os
// dados da empresa e sobre como usar a plataforma, com links para as telas.
//
// Segurança: as consultas usam o JWT do usuário (client com anon key + header
// Authorization), então o RLS vale e cada pessoa só vê o que já vê na tela. Só
// leitura: as ferramentas não escrevem nada. Cota por pessoa por hora.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarIA, ErroIA, type MensagemIA } from "../_shared/ai.ts";
import { executarFerramentaAssistente, FERRAMENTAS_ASSISTENTE, limparLinks, rotaValida } from "../_shared/assistente/ferramentas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const COTA_POR_HORA = 60;
const MAX_HISTORICO = 10;
const MAX_MENSAGEM = 2000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function instrucoes(p: { nomeUsuario: string; papel: string; empresa: string; hoje: string; tela: string | null }) {
  return [
    `Você é o assistente do CRM da empresa ${p.empresa}. Fala com ${p.nomeUsuario} (${p.papel === "admin" ? "administrador" : "membro da equipe"}). Hoje é ${p.hoje}, fuso de Brasília.${p.tela ? ` A pessoa está na tela ${p.tela}.` : ""}`,
    "",
    "COMO RESPONDER",
    "- Português do Brasil, direto e prático. Primeiro a resposta, depois o detalhe. Sem travessão.",
    "- Para 'o que falta configurar', 'está tudo certo?' ou 'por que algo não funciona', comece por estado_da_conta.",
    "- Para qualquer número, nome ou situação da empresa, use as ferramentas. Nunca invente dado. Se a ferramenta não trouxer, diga que não encontrou.",
    "- Para dúvidas de como fazer algo na plataforma, chame ajuda_plataforma e siga o que ela devolver. Nunca descreva telas, menus ou caminhos que não estejam neles.",
    "- Sempre que citar um contato, negócio, conversa, tela ou guia, escreva como link markdown usando o campo `link` (ou `tela`, `guia_completo`) que veio das ferramentas, por exemplo [Maria Souza](/contacts/ID). Nunca invente um caminho.",
    "- Listas com mais de 3 itens: use tabela markdown (| col | col |) ou lista com hífen. Valores em reais já vêm formatados.",
    "- Você só consulta, não altera nada. Se pedirem para criar, mover ou apagar, explique onde fazer e dê o link da tela.",
    "- Se uma tela for só de administrador e a pessoa não for, diga isso e sugira pedir a um administrador.",
    "- Datas no formato brasileiro (25/09, 14h30).",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });

  try {
    const { data: userData } = await db.auth.getUser(auth.slice(7));
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: perfil } = await db.from("profiles").select("org_id, full_name").eq("id", user.id).maybeSingle();
    if (!perfil?.org_id) return json({ error: "Usuário sem organização" }, 403);

    const body = await req.json().catch(() => ({}));
    const pergunta = String(body.mensagem ?? "").trim().slice(0, MAX_MENSAGEM);
    if (!pergunta) return json({ error: "Escreva a pergunta." }, 400);

    const { data: dentroDaCota, error: erroCota } = await db.rpc("consumir_cota_assistente", { p_limite: COTA_POR_HORA });
    if (erroCota) return json({ error: "Não foi possível verificar a cota de uso." }, 500);
    if (dentroDaCota === false) return json({ error: `Limite de ${COTA_POR_HORA} perguntas por hora atingido. Tente de novo em alguns minutos.` }, 429);

    const [{ data: org }, { data: ehAdmin }] = await Promise.all([
      db.from("organizations").select("name").eq("id", perfil.org_id).maybeSingle(),
      db.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    ]);
    const historico = (Array.isArray(body.historico) ? body.historico : [])
      .filter((m: { papel?: string; texto?: string }) => (m?.papel === "usuario" || m?.papel === "assistente") && typeof m.texto === "string")
      .slice(-MAX_HISTORICO)
      .map((m: { papel: string; texto: string }): MensagemIA => ({ role: m.papel === "usuario" ? "user" : "assistant", content: m.texto.slice(0, MAX_MENSAGEM) }));
    // Só tela do app entra no prompt: "//host" ou rota inventada viram null.
    const tela = typeof body.tela === "string" && rotaValida(body.tela) ? body.tela.slice(0, 120) : null;
    const hoje = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" }).format(new Date());

    const ctx = { db, orgId: perfil.org_id as string, userId: user.id };
    const { texto } = await chamarIA({
      tarefa: "chat",
      maxTokens: 1500,
      system: instrucoes({ nomeUsuario: (perfil.full_name as string | null) ?? "usuário", papel: ehAdmin ? "admin" : "member", empresa: (org?.name as string | undefined) ?? "sua empresa", hoje, tela }),
      messages: [...historico, { role: "user", content: pergunta }],
      // Primeiro consulta, depois responde: sem isso o modelo às vezes inventava
      // valor, link e caminho de tela em vez de buscar (teste de 25/09/2026).
      exigirFerramenta: true,
      tools: FERRAMENTAS_ASSISTENTE,
      executarFerramenta: (nome, args) => executarFerramentaAssistente(ctx, nome, args),
    });
    const resposta = limparLinks(texto.trim());
    if (!resposta) return json({ error: "O assistente não conseguiu responder agora. Tente reformular." }, 502);
    return json({ ok: true, resposta });
  } catch (err) {
    console.error("[assistente]", err);
    const status = err instanceof ErroIA ? (err.status >= 400 && err.status < 600 ? err.status : 502) : 500;
    return json({ error: "O assistente está indisponível no momento. Tente de novo em instantes." }, status);
  }
});
