import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useAuth } from "@/hooks/useAuth";

/**
 * Estado do assistente do CRM, montado uma vez acima das rotas: o painel não
 * fecha nem perde a conversa quando a pessoa clica num link da resposta.
 * Conversas ficam no navegador, por usuário (nada de dado do cliente no servidor
 * além do que a pessoa já pode ver).
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
  enviando: boolean;
  enviar: (texto: string, opcoes?: { nova?: boolean }) => Promise<void>;
  novaConversa: () => void;
  selecionar: (id: string) => void;
  apagar: (id: string) => void;
}

const Ctx = createContext<Valor | null>(null);
const MAX_CONVERSAS = 20;
const HISTORICO_ENVIADO = 10;

function ler(chave: string): Conversa[] {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as Conversa[]) : [];
  } catch {
    return [];
  }
}

export function AssistenteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const chave = user ? `assistente_crm_${user.id}` : null;
  const [aberto, setAberto] = useState(false);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [atualId, setAtualId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { setConversas(chave ? ler(chave) : []); setAtualId(null); }, [chave]);
  useEffect(() => {
    if (!chave) return;
    try { localStorage.setItem(chave, JSON.stringify(conversas.slice(0, MAX_CONVERSAS))); } catch { /* armazenamento indisponível: segue só na memória */ }
  }, [chave, conversas]);

  const conversa = conversas.find((c) => c.id === atualId) ?? null;

  const enviar = useCallback(async (texto: string, opcoes?: { nova?: boolean }) => {
    const pergunta = texto.trim();
    if (!pergunta || enviando) return;
    const id = opcoes?.nova ? crypto.randomUUID() : (atualId ?? crypto.randomUUID());
    const anterior = conversas.find((c) => c.id === id);
    const historico = (anterior?.mensagens ?? []).filter((m) => !m.erro).slice(-HISTORICO_ENVIADO);
    const comPergunta: Conversa = { id, titulo: anterior?.titulo ?? pergunta.slice(0, 48), mensagens: [...(anterior?.mensagens ?? []), { papel: "usuario", texto: pergunta }], atualizada: Date.now() };
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
    setConversas((cs) => cs.map((c) => (c.id === id ? { ...c, mensagens: [...c.mensagens, resposta], atualizada: Date.now() } : c)));
    setEnviando(false);
  }, [atualId, conversas, enviando, pathname]);

  const valor = useMemo<Valor>(() => ({
    aberto,
    abrir: (pergunta) => { setAberto(true); if (pergunta) void enviar(pergunta, { nova: true }); },
    fechar: () => setAberto(false),
    conversa, conversas, enviando, enviar,
    novaConversa: () => setAtualId(null),
    selecionar: (id) => setAtualId(id),
    apagar: (id) => { setConversas((cs) => cs.filter((c) => c.id !== id)); if (atualId === id) setAtualId(null); },
  }), [aberto, conversa, conversas, enviando, enviar, atualId]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAssistente() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAssistente precisa de <AssistenteProvider>");
  return v;
}
