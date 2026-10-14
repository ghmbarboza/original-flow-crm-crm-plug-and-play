import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";

/**
 * Estado do assistente do CRM, montado uma vez acima das rotas: o painel não
 * fecha nem perde a conversa quando a pessoa clica num link da resposta.
 *
 * Histórico no banco (assistente_conversas), visível só para quem conversou:
 * a conversa acompanha a pessoa em qualquer computador. Conversas antigas que
 * estavam só no navegador são levadas para o banco na primeira abertura.
 */
export interface MensagemAssistente {
  papel: "usuario" | "assistente";
  texto: string;
  erro?: boolean;
}
export interface Conversa {
  id: string;
  titulo: string;
  mensagens: MensagemAssistente[];
  atualizada: number;
}

interface Valor {
  aberto: boolean;
  abrir: (pergunta?: string) => void;
  fechar: () => void;
  conversa: Conversa | null;
  conversas: Conversa[];
  carregando: boolean;
  enviando: boolean;
  enviar: (texto: string, opcoes?: { nova?: boolean }) => Promise<void>;
  tentarDeNovo: () => Promise<void>;
  novaConversa: () => void;
  selecionar: (id: string) => void;
  apagar: (id: string) => Promise<void>;
}

const Ctx = createContext<Valor | null>(null);
const MAX_CONVERSAS = 50;
const HISTORICO_ENVIADO = 16;
const MAX_MENSAGENS_GUARDADAS = 200;
const TAMANHO_TITULO = 80;
/** Abaixo do teto do banco (512 KB por conversa), com folga para acentos. */
const MAX_CARACTERES_GUARDADOS = 200_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** As mensagens mais recentes que cabem no histórico do banco. */
function paraGuardar(mensagens: MensagemAssistente[]): Json {
  const ultimas = mensagens.slice(-MAX_MENSAGENS_GUARDADAS);
  let total = 0;
  let inicio = ultimas.length;
  while (inicio > 0 && total + ultimas[inicio - 1].texto.length <= MAX_CARACTERES_GUARDADOS) total += ultimas[--inicio].texto.length;
  return ultimas.slice(inicio) as unknown as Json;
}

/**
 * O que vai de contexto para a IA: só pares pergunta e resposta que deram certo.
 * Pergunta cuja resposta falhou fica de fora, para não mandar duas perguntas
 * seguidas (alguns provedores recusam).
 */
function historicoParaIA(mensagens: MensagemAssistente[], limite: number): MensagemAssistente[] {
  const pares = mensagens.filter((m, i) => !m.erro && !(m.papel === "usuario" && (mensagens[i + 1]?.erro || i === mensagens.length - 1)));
  return pares.slice(-limite).map(({ papel, texto }) => ({ papel, texto }));
}

/** Só o que tem forma de mensagem: dado salvo por versão antiga não derruba a tela. */
const mensagensValidas = (bruto: unknown): MensagemAssistente[] =>
  (Array.isArray(bruto) ? bruto : []).filter((m): m is MensagemAssistente =>
    !!m && (m.papel === "usuario" || m.papel === "assistente") && typeof m.texto === "string");

type Linha = { id: string; titulo: string; mensagens: Json; updated_at: string };
const daLinha = (l: Linha): Conversa => ({
  id: l.id, titulo: l.titulo,
  mensagens: mensagensValidas(l.mensagens),
  atualizada: new Date(l.updated_at).getTime(),
});

/** Conversas que versões anteriores guardavam só no navegador. */
function lerDoNavegador(chave: string): Conversa[] {
  try {
    const bruto = localStorage.getItem(chave);
    const lista = bruto ? (JSON.parse(bruto) as Conversa[]) : [];
    return Array.isArray(lista) ? lista.filter((c) => c?.id && Array.isArray(c.mensagens) && c.mensagens.length > 0) : [];
  } catch {
    return [];
  }
}

export function AssistenteProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  const userId = user?.id ?? null;
  const orgId = profile?.org_id ?? null;
  const [aberto, setAberto] = useState(false);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [atualId, setAtualId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Refs: o estado do React só muda no próximo render, e um duplo clique ou a
  // troca de conta no meio do envio precisam ser vistos na hora.
  const ocupado = useRef(false);
  const contaAtual = useRef(userId);
  const apagadas = useRef(new Set<string>());
  contaAtual.current = userId;

  const salvar = useCallback(async (c: Conversa) => {
    if (!userId || !orgId) return;
    const { error } = await supabase.from("assistente_conversas").upsert({
      id: c.id, org_id: orgId, user_id: userId, titulo: c.titulo,
      mensagens: paraGuardar(c.mensagens),
      updated_at: new Date(c.atualizada).toISOString(),
    });
    if (error) {
      console.error("[assistente] histórico não salvo", error);
      toast.error("A conversa continua aqui, mas não foi salva no histórico. Tente de novo mais tarde.");
    }
  }, [userId, orgId]);

  useEffect(() => {
    setConversas([]);
    setAtualId(null);
    if (!userId || !orgId) return;
    let ativo = true;
    (async () => {
      setCarregando(true);
      const chaveAntiga = `assistente_crm_${userId}`;
      const antigas = lerDoNavegador(chaveAntiga);
      if (antigas.length) {
        const { error } = await supabase.from("assistente_conversas").upsert(antigas.slice(0, MAX_CONVERSAS).map((c) => ({
          id: UUID.test(c.id) ? c.id : crypto.randomUUID(), org_id: orgId, user_id: userId, titulo: (c.titulo || "Conversa").slice(0, TAMANHO_TITULO),
          mensagens: paraGuardar(mensagensValidas(c.mensagens)),
          updated_at: new Date(c.atualizada || Date.now()).toISOString(),
        })), { ignoreDuplicates: true });
        if (error) console.error("[assistente] conversas do navegador não migradas", error);
        else try { localStorage.removeItem(chaveAntiga); } catch { /* sem armazenamento: nada a limpar */ }
      }
      const { data, error } = await supabase.from("assistente_conversas")
        .select("id, titulo, mensagens, updated_at").order("updated_at", { ascending: false }).limit(MAX_CONVERSAS);
      if (!ativo) return;
      if (error) {
        console.error("[assistente] histórico não carregou", error);
        toast.error("Não foi possível carregar as conversas anteriores do assistente.");
      } else {
        setConversas((data ?? []).map(daLinha));
      }
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [userId, orgId]);

  const conversa = conversas.find((c) => c.id === atualId) ?? null;

  /** Pergunta dentro da conversa `base` (ou numa nova) e guarda a resposta. */
  const perguntar = useCallback(async (pergunta: string, base: Conversa | null) => {
    if (ocupado.current) return;
    ocupado.current = true;
    const conta = contaAtual.current;
    const id = base?.id ?? crypto.randomUUID();
    const historico = historicoParaIA(base?.mensagens ?? [], HISTORICO_ENVIADO);
    const comPergunta: Conversa = {
      id, titulo: base?.titulo ?? pergunta.slice(0, TAMANHO_TITULO),
      mensagens: [...(base?.mensagens ?? []), { papel: "usuario", texto: pergunta }], atualizada: Date.now(),
    };
    setConversas((cs) => [comPergunta, ...cs.filter((c) => c.id !== id)]);
    setAtualId(id);
    setEnviando(true);
    let resposta: MensagemAssistente;
    try {
      const { data, error } = await supabase.functions.invoke("assistente", { body: { mensagem: pergunta, historico, tela: pathname } });
      if (error) throw await erroDeFunction(error, "O assistente não respondeu.");
      if (data?.error) throw new Error(data.error);
      resposta = { papel: "assistente", texto: String(data?.resposta ?? "") };
    } catch (e) {
      resposta = { papel: "assistente", texto: e instanceof Error ? e.message : "O assistente não respondeu.", erro: true };
    }
    ocupado.current = false;
    setEnviando(false);
    // Trocou de conta ou apagou a conversa enquanto esperava: a resposta não volta.
    if (contaAtual.current !== conta || apagadas.current.has(id)) return;
    const final: Conversa = { ...comPergunta, mensagens: [...comPergunta.mensagens, resposta], atualizada: Date.now() };
    setConversas((cs) => [final, ...cs.filter((c) => c.id !== id)]);
    await salvar(final);
  }, [pathname, salvar]);

  const enviar = useCallback(async (texto: string, opcoes?: { nova?: boolean }) => {
    const pergunta = texto.trim();
    if (!pergunta) return;
    await perguntar(pergunta, opcoes?.nova ? null : conversa);
  }, [conversa, perguntar]);

  /** Refaz a última pergunta quando a resposta deu erro. */
  const tentarDeNovo = useCallback(async () => {
    if (!conversa) return;
    const msgs = conversa.mensagens;
    const ultima = msgs[msgs.length - 1];
    const pergunta = msgs[msgs.length - 2];
    if (!ultima?.erro || pergunta?.papel !== "usuario") return;
    await perguntar(pergunta.texto, { ...conversa, mensagens: msgs.slice(0, -2) });
  }, [conversa, perguntar]);

  const apagar = useCallback(async (id: string) => {
    const { error } = await supabase.from("assistente_conversas").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível apagar a conversa.");
      return;
    }
    apagadas.current.add(id);
    setConversas((cs) => cs.filter((c) => c.id !== id));
    setAtualId((atual) => (atual === id ? null : atual));
  }, []);

  const valor = useMemo<Valor>(() => ({
    aberto,
    abrir: (pergunta) => { setAberto(true); if (pergunta) void enviar(pergunta, { nova: true }); },
    fechar: () => setAberto(false),
    conversa, conversas, carregando, enviando, enviar, tentarDeNovo, apagar,
    novaConversa: () => setAtualId(null),
    selecionar: (id) => setAtualId(id),
  }), [aberto, conversa, conversas, carregando, enviando, enviar, tentarDeNovo, apagar]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAssistente() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAssistente precisa de <AssistenteProvider>");
  return v;
}
