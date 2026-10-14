import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssistente } from "@/components/assistente/AssistenteContext";

const EXEMPLOS = [
  "O que ainda falta configurar na minha conta?",
  "Como está meu funil hoje?",
  "Como estão as metas deste mês?",
  "Quem está esperando resposta no WhatsApp?",
  "Como a IA marca reuniões?",
];

/** Entrada do assistente no topo da Central de ajuda: pergunta aqui, responde no painel. */
export function AssistenteCaixa() {
  const { abrir } = useAssistente();
  const [texto, setTexto] = useState("");
  const perguntar = (t: string) => { if (t.trim()) { abrir(t.trim()); setTexto(""); } };
  return (
    <section className="rounded-xl p-5" style={{ background: "var(--via-navy)", color: "var(--via-white)" }} data-testid="ajuda-assistente">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-5 w-5" strokeWidth={1.5} />
        <h2 className="font-medium">Pergunte ao assistente</h2>
      </div>
      <p className="mb-3 text-sm opacity-90">Ele consulta os dados da sua conta (contatos, negócios, funis, metas, conversas, agenda, equipe e números) e os guias da plataforma, e responde com o link da tela. As conversas ficam salvas e dá para copiar a resposta para mandar a alguém.</p>
      <form onSubmit={(e) => { e.preventDefault(); perguntar(texto); }} className="flex gap-2">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: quais negócios estão parados há mais de 7 dias?" className="h-11 bg-white text-foreground" aria-label="Pergunta para o assistente" data-testid="ajuda-assistente-input" />
        <Button type="submit" variant="secondary" className="h-11 gap-1.5" disabled={!texto.trim()}><Send className="h-4 w-4" /> Perguntar</Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXEMPLOS.map((e) => (
          <button key={e} type="button" onClick={() => perguntar(e)} className="rounded-full border border-white/30 px-3 py-1 text-xs hover:bg-white/10">{e}</button>
        ))}
      </div>
    </section>
  );
}
