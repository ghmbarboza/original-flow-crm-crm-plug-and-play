import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bot, History, Loader2, Maximize2, Minimize2, Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useAssistente } from "@/components/assistente/AssistenteContext";
import { RespostaMarkdown } from "@/components/assistente/RespostaMarkdown";

/** Sugestões por área da tela onde a pessoa está: começa pelo que faz sentido ali. */
const SUGESTOES_GERAIS = [
  "Como está meu funil hoje?",
  "Quais negócios estão parados há mais de 7 dias?",
  "Quais são minhas tarefas atrasadas?",
  "Quem está esperando resposta no WhatsApp?",
  "Quantos leads novos chegaram nos últimos 7 dias e de onde vieram?",
  "Como conecto meu calendário?",
];
const SUGESTOES_POR_TELA: { prefixo: string; itens: string[] }[] = [
  { prefixo: "/deals", itens: ["Quais os 5 maiores negócios abertos?", "Quais negócios estão parados há mais de 7 dias?", "Quanto ganhamos nos últimos 30 dias?"] },
  { prefixo: "/contacts", itens: ["Quais leads chegaram esta semana?", "Resuma o que a IA sabe dos leads mais recentes", "Como importo contatos de outro CRM?"] },
  { prefixo: "/whatsapp", itens: ["Quem está esperando resposta?", "Quais conversas estão com SLA estourado?", "Por que a IA não está respondendo?"] },
  { prefixo: "/agenda", itens: ["Quais reuniões tenho esta semana?", "Como a IA marca reuniões?"] },
  { prefixo: "/voz", itens: ["Como faço a primeira ligação pela IA?", "O que falta para ligar?"] },
  { prefixo: "/settings", itens: ["O que ainda falta configurar?", "Onde cadastro as chaves de integração?"] },
];

export function AssistentePainel() {
  const { pathname } = useLocation();
  const { isApproved } = useAuth();
  const a = useAssistente();
  const [texto, setTexto] = useState("");
  const [grande, setGrande] = useState(false);
  const [historico, setHistorico] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [a.conversa?.mensagens.length, a.enviando]);

  const publica = pathname.startsWith("/auth") || pathname.startsWith("/f/") || pathname === "/pending-approval";
  if (publica || !isApproved) return null;

  const sugestoes = SUGESTOES_POR_TELA.find((s) => pathname.startsWith(s.prefixo))?.itens ?? SUGESTOES_GERAIS;
  const mandar = () => { const t = texto; setTexto(""); void a.enviar(t); };

  if (!a.aberto) {
    return (
      <button type="button" onClick={() => a.abrir()} aria-label="Abrir o assistente" data-testid="assistente-abrir"
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
        style={{ background: "var(--via-navy)", color: "var(--via-white)" }}>
        <Bot className="h-6 w-6" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div role="dialog" aria-label="Assistente do CRM" data-testid="assistente-painel"
      className={`fixed bottom-5 right-5 z-50 flex flex-col overflow-hidden rounded-xl border shadow-2xl ${grande ? "h-[85vh] w-[min(46rem,calc(100vw-2.5rem))]" : "h-[34rem] w-[min(25rem,calc(100vw-2.5rem))]"}`}
      style={{ background: "var(--via-white, #fff)", borderColor: "var(--via-border)" }}>
      <header className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--via-navy)", color: "var(--via-white)" }}>
        <Bot className="h-5 w-5" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Assistente do CRM</p>
          <p className="truncate text-[11px] opacity-80">Consulta os dados da sua conta e explica a plataforma</p>
        </div>
        <button type="button" onClick={() => { a.novaConversa(); setHistorico(false); }} aria-label="Nova conversa" className="rounded p-1 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => setHistorico((h) => !h)} aria-label="Conversas anteriores" className="rounded p-1 hover:bg-white/10"><History className="h-4 w-4" /></button>
        <button type="button" onClick={() => setGrande((g) => !g)} aria-label={grande ? "Diminuir" : "Expandir"} className="rounded p-1 hover:bg-white/10">{grande ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        <button type="button" onClick={a.fechar} aria-label="Fechar o assistente" className="rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </header>

      <div className="flex-1 overflow-y-auto p-4" style={{ color: "var(--via-text-body)" }}>
        {historico ? (
          <div className="space-y-1">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--via-text-muted)" }}>Conversas anteriores</p>
            {a.conversas.length === 0 && <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhuma conversa ainda.</p>}
            {a.conversas.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <button type="button" onClick={() => { a.selecionar(c.id); setHistorico(false); }} className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60">{c.titulo}</button>
                <button type="button" onClick={() => a.apagar(c.id)} aria-label={`Apagar ${c.titulo}`} className="rounded p-1 hover:bg-muted/60"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        ) : !a.conversa ? (
          <div className="space-y-3" data-testid="assistente-sugestoes">
            <p className="text-sm">Pergunte sobre seus contatos, negócios, conversas, agenda e números, ou sobre como usar a plataforma. As respostas trazem o link direto para a tela.</p>
            <div className="flex flex-col gap-1.5">
              {sugestoes.map((s) => (
                <button key={s} type="button" onClick={() => void a.enviar(s)} className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50" style={{ borderColor: "var(--via-border)" }}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {a.conversa.mensagens.map((m, i) => (
              <div key={i} className={m.papel === "usuario" ? "flex justify-end" : ""}>
                {m.papel === "usuario" ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm" style={{ background: "var(--via-navy)", color: "var(--via-white)" }}>{m.texto}</p>
                ) : (
                  <div className={`rounded-lg px-3 py-2 ${m.erro ? "border" : ""}`} style={{ background: m.erro ? "transparent" : "var(--via-surface)", borderColor: "var(--via-danger)" }} data-testid="assistente-resposta">
                    <RespostaMarkdown texto={m.texto} onNavegar={() => { if (!grande) return; setGrande(false); }} />
                  </div>
                )}
              </div>
            ))}
            {a.enviando && <p className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Consultando seus dados…</p>}
            <div ref={fim} />
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); mandar(); }} className="flex items-end gap-2 border-t p-3" style={{ borderColor: "var(--via-border)" }}>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} maxLength={2000} placeholder="Pergunte qualquer coisa…" aria-label="Pergunta para o assistente" data-testid="assistente-input"
          className="max-h-32 min-h-[2.5rem] resize-none"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(); } }} />
        <Button type="submit" size="icon" disabled={!texto.trim() || a.enviando} aria-label="Enviar" data-testid="assistente-enviar"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
