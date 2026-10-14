import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Bot, Check, Copy, History, Loader2, Maximize2, Minimize2, Plus, RotateCcw, Search, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useAssistente, type MensagemAssistente } from "@/components/assistente/AssistenteContext";
import { RespostaMarkdown } from "@/components/assistente/RespostaMarkdown";
import { copiarTexto, htmlDaResposta } from "@/lib/assistente/copiar";
import { conversaComoTexto, paraTextoSimples } from "@/lib/assistente/texto";

/** Sugestões por área da tela onde a pessoa está: começa pelo que faz sentido ali. */
const SUGESTOES_GERAIS = [
  "Como está meu funil hoje?",
  "Como estão as metas deste mês?",
  "Quais negócios estão parados há mais de 7 dias?",
  "Quais são minhas tarefas atrasadas?",
  "Quem está esperando resposta no WhatsApp?",
  "Quantos leads novos chegaram nos últimos 7 dias e de onde vieram?",
];
const SUGESTOES_POR_TELA: { prefixo: string; itens: string[] }[] = [
  { prefixo: "/deals", itens: ["Como está cada funil hoje?", "Quais os 5 maiores negócios abertos?", "Quais negócios estão parados há mais de 7 dias?", "Como crio um novo funil?"] },
  { prefixo: "/sales-goals", itens: ["Como estão as metas deste mês?", "Quem está mais longe da meta?", "Como crio uma meta de conversão por vendedor?"] },
  { prefixo: "/dashboard", itens: ["Resuma os números dos últimos 30 dias", "Qual origem traz mais leads?", "Como estão as metas deste mês?"] },
  { prefixo: "/contacts", itens: ["Quais leads chegaram esta semana?", "Resuma o que a IA sabe dos leads mais recentes", "Como importo contatos de outro CRM?"] },
  { prefixo: "/whatsapp", itens: ["Quem está esperando resposta?", "Quais conversas estão com SLA estourado?", "Passaram 24h, como respondo o cliente?", "Por que a IA não está respondendo?"] },
  { prefixo: "/agenda", itens: ["Quais reuniões tenho esta semana?", "Como a IA marca reuniões?"] },
  { prefixo: "/voz", itens: ["Como faço a primeira ligação pela IA?", "O que falta para ligar?"] },
  { prefixo: "/products", itens: ["Quais produtos estão com estoque baixo?", "Liste os produtos ativos e preços"] },
  { prefixo: "/settings", itens: ["O que ainda falta configurar?", "Quais automações estão ligadas?", "Como uso minha própria chave de IA?"] },
];

const quando = (ms: number) => {
  const d = new Date(ms);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Botão pequeno que mostra "Copiado" por um instante depois de copiar. */
function BotaoCopiar({ rotulo, copiar, testId }: { rotulo: string; copiar: () => Promise<boolean>; testId: string }) {
  const [feito, setFeito] = useState(false);
  useEffect(() => {
    if (!feito) return;
    const t = setTimeout(() => setFeito(false), 2000);
    return () => clearTimeout(t);
  }, [feito]);
  const aoClicar = async () => {
    if (await copiar()) setFeito(true);
    else toast.error("O navegador não deixou copiar. Selecione o texto e use Ctrl+C.");
  };
  return (
    <button type="button" onClick={() => void aoClicar()} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-muted/60" style={{ color: "var(--via-text-muted)" }} data-testid={testId}>
      {feito ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {feito ? "Copiado" : rotulo}
    </button>
  );
}

function Resposta({ m, ultima, onNavegar, onTentarDeNovo }: { m: MensagemAssistente; ultima: boolean; onNavegar: () => void; onTentarDeNovo: () => void }) {
  const corpo = useRef<HTMLDivElement>(null);
  if (m.erro) {
    return (
      <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--via-danger)" }} data-testid="assistente-resposta">
        <p className="text-sm">{m.texto}</p>
        {ultima && (
          <Button type="button" size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-xs" onClick={onTentarDeNovo} data-testid="assistente-tentar-de-novo">
            <RotateCcw className="h-3.5 w-3.5" /> Tentar de novo
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--via-surface)" }} data-testid="assistente-resposta">
      <div ref={corpo}><RespostaMarkdown texto={m.texto} onNavegar={onNavegar} /></div>
      <div className="mt-1 flex justify-end">
        <BotaoCopiar
          rotulo="Copiar" testId="assistente-copiar"
          copiar={() => copiarTexto(paraTextoSimples(m.texto, window.location.origin), corpo.current ? htmlDaResposta(corpo.current) : undefined)}
        />
      </div>
    </div>
  );
}

export function AssistentePainel() {
  const { pathname } = useLocation();
  const { isApproved } = useAuth();
  const a = useAssistente();
  const [texto, setTexto] = useState("");
  const [grande, setGrande] = useState(false);
  const [historico, setHistorico] = useState(false);
  const [busca, setBusca] = useState("");
  const [confirmarApagar, setConfirmarApagar] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [a.conversa?.mensagens.length, a.enviando]);

  const publica = pathname.startsWith("/auth") || pathname.startsWith("/f/") || pathname === "/pending-approval";
  if (publica || !isApproved) return null;

  const sugestoes = SUGESTOES_POR_TELA.find((s) => pathname.startsWith(s.prefixo))?.itens ?? SUGESTOES_GERAIS;
  // Durante uma resposta, Enter não envia nem apaga o que a pessoa já digitou.
  const mandar = () => { if (a.enviando || !texto.trim()) return; const t = texto; setTexto(""); void a.enviar(t); };
  const alvo = semAcento(busca.trim());
  const encontradas = alvo
    ? a.conversas.filter((c) => semAcento(c.titulo).includes(alvo) || c.mensagens.some((m) => semAcento(m.texto).includes(alvo)))
    : a.conversas;

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
        <button type="button" onClick={() => { a.novaConversa(); setHistorico(false); }} aria-label="Nova conversa" title="Nova conversa" className="rounded p-1 hover:bg-white/10" data-testid="assistente-nova"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => setHistorico((h) => !h)} aria-label="Conversas anteriores" title="Conversas anteriores" className="rounded p-1 hover:bg-white/10" data-testid="assistente-historico"><History className="h-4 w-4" /></button>
        <button type="button" onClick={() => setGrande((g) => !g)} aria-label={grande ? "Diminuir" : "Expandir"} title={grande ? "Diminuir" : "Expandir"} className="rounded p-1 hover:bg-white/10">{grande ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        <button type="button" onClick={a.fechar} aria-label="Fechar o assistente" title="Fechar" className="rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </header>

      <div className="flex-1 overflow-y-auto p-4" style={{ color: "var(--via-text-body)" }}>
        {historico ? (
          <div className="space-y-2" data-testid="assistente-lista-historico">
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--via-text-muted)" }}>Conversas anteriores</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: "var(--via-text-muted)" }} />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas conversas" aria-label="Buscar nas conversas" className="h-9 pl-8" data-testid="assistente-busca" />
            </div>
            {a.carregando && <p className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
            {!a.carregando && encontradas.length === 0 && (
              <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>{alvo ? "Nenhuma conversa com esse termo." : "Nenhuma conversa ainda."}</p>
            )}
            {encontradas.map((c) => (
              <div key={c.id} className="flex items-center gap-2" data-testid="assistente-item-historico">
                <button type="button" onClick={() => { a.selecionar(c.id); setHistorico(false); setBusca(""); }} className="flex min-w-0 flex-1 items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60">
                  <span className="min-w-0 flex-1 truncate">{c.titulo}</span>
                  <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--via-text-muted)" }}>{quando(c.atualizada)}</span>
                </button>
                {confirmarApagar === c.id ? (
                  <button type="button" onClick={() => { setConfirmarApagar(null); void a.apagar(c.id); }} aria-label={`Confirmar: apagar ${c.titulo}`} className="rounded px-1.5 py-0.5 text-xs font-medium hover:bg-muted/60" style={{ color: "var(--via-danger)" }} data-testid="assistente-apagar-confirmar">Apagar?</button>
                ) : (
                  <button type="button" onClick={() => setConfirmarApagar(c.id)} aria-label={`Apagar ${c.titulo}`} title="Apagar" className="rounded p-1 hover:bg-muted/60"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        ) : !a.conversa ? (
          <div className="space-y-3" data-testid="assistente-sugestoes">
            <p className="text-sm">Pergunte sobre contatos, negócios, funis, metas, conversas, agenda, equipe e números, ou sobre como usar a plataforma. As respostas trazem o link direto para a tela e dá para copiar e mandar para alguém.</p>
            <div className="flex flex-col gap-1.5">
              {sugestoes.map((s) => (
                <button key={s} type="button" disabled={a.enviando} onClick={() => void a.enviar(s)} className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50" style={{ borderColor: "var(--via-border)" }}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-medium" style={{ color: "var(--via-text-muted)" }}>{a.conversa.titulo}</p>
              <BotaoCopiar
                rotulo="Copiar conversa" testId="assistente-copiar-conversa"
                copiar={() => copiarTexto(conversaComoTexto(a.conversa!.titulo, a.conversa!.mensagens, window.location.origin))}
              />
            </div>
            {a.conversa.mensagens.map((m, i, todas) => (
              <div key={i} className={m.papel === "usuario" ? "flex justify-end" : ""}>
                {m.papel === "usuario" ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm" style={{ background: "var(--via-navy)", color: "var(--via-white)" }}>{m.texto}</p>
                ) : (
                  <Resposta m={m} ultima={i === todas.length - 1 && !a.enviando} onNavegar={() => setGrande(false)} onTentarDeNovo={() => void a.tentarDeNovo()} />
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
