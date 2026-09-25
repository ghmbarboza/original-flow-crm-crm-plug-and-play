import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, HelpCircle, LifeBuoy, Search, Wrench } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { EmptyState } from "@/components/EmptyState";
import { StatusDaConta } from "@/components/ajuda/StatusDaConta";
import { GuiaDetalhe } from "@/components/ajuda/GuiaDetalhe";
import { AssistenteCaixa } from "@/components/assistente/AssistenteCaixa";
import { CAPITULOS, GUIAS, type Guia } from "@/lib/ajuda/guias";
import { GLOSSARIO, PROBLEMAS, type Problema } from "@/lib/ajuda/problemas";
import { FAQ_SECOES } from "@/lib/ajuda/faq";

const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const casa = (q: string, ...textos: (string | undefined)[]) => textos.some((t) => t && normalizar(t).includes(q));

const ANCORAS = [
  { id: "guias", rotulo: "Guias" },
  { id: "problemas", rotulo: "Resolver problemas" },
  { id: "perguntas", rotulo: "Perguntas frequentes" },
  { id: "glossario", rotulo: "Glossário" },
];

function Titulo({ id, icone: Icone, children }: { id?: string; icone: typeof BookOpen; children: string }) {
  return (
    <h2 id={id} className="flex scroll-mt-4 items-center gap-2 text-lg font-medium" style={{ color: "var(--via-text-primary)" }}>
      <Icone className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} /> {children}
    </h2>
  );
}

function CartaoGuia({ guia, onAbrir }: { guia: Guia; onAbrir: () => void }) {
  return (
    <button type="button" onClick={onAbrir} className="via-card flex h-full flex-col gap-1 p-4 text-left transition-shadow hover:shadow-md" data-testid={`ajuda-card-${guia.id}`}>
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{guia.titulo}</span>
        {guia.admin && <Badge variant="outline" className="shrink-0 text-[10px]">Admin</Badge>}
      </span>
      <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>{guia.resumo}</span>
      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-via-blue">Ver passo a passo <ArrowRight className="h-3 w-3" strokeWidth={1.5} /></span>
    </button>
  );
}

function ItemProblema({ p }: { p: Problema }) {
  return (
    <AccordionItem value={p.id}>
      <AccordionTrigger className="text-left text-sm">{p.sintoma}</AccordionTrigger>
      <AccordionContent className="space-y-3 text-sm" style={{ color: "var(--via-text-body)" }}>
        <div>
          <p className="font-medium" style={{ color: "var(--via-text-primary)" }}>Causas comuns</p>
          <ul className="list-disc space-y-0.5 pl-5">{p.causas.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
        <div>
          <p className="font-medium" style={{ color: "var(--via-text-primary)" }}>Como resolver</p>
          <ol className="list-decimal space-y-0.5 pl-5">{p.solucao.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
        <Link to={p.link.to} className="inline-flex items-center gap-1 text-sm font-medium text-via-blue hover:underline">{p.link.rotulo} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} /></Link>
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * Central de ajuda: assistente, estado real da conta, como a plataforma funciona,
 * guias passo a passo por área, resolução de problemas, perguntas e glossário.
 * `?guia=<id>` abre um guia direto (links do assistente e das telas).
 */
export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const guiaAberto = GUIAS.find((g) => g.id === params.get("guia")) ?? null;
  const abrirGuia = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set("guia", id); else p.delete("guia");
    setParams(p, { replace: true });
  };

  const q = normalizar(query.trim());
  const resultados = useMemo(() => {
    if (!q) return null;
    return {
      guias: GUIAS.filter((g) => casa(q, g.titulo, g.resumo, g.paraQue, g.palavras, ...g.passos.map((p) => p.texto))),
      problemas: PROBLEMAS.filter((p) => casa(q, p.sintoma, p.palavras, ...p.causas, ...p.solucao)),
      faqs: FAQ_SECOES.flatMap((s) => s.faqs.filter((f) => casa(q, f.q, f.a)).map((f) => ({ ...f, secao: s.title }))),
      termos: GLOSSARIO.filter((t) => casa(q, t.termo, t.definicao)),
    };
  }, [q]);
  const totalResultados = resultados ? resultados.guias.length + resultados.problemas.length + resultados.faqs.length + resultados.termos.length : 0;
  const visaoGeral = GUIAS.find((g) => g.id === "visao-geral")!;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8" data-testid="ajuda-page">
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <HelpCircle className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>Central de ajuda</h1>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar em guias, problemas, perguntas e termos" className="h-11 pl-9" aria-label="Buscar na ajuda" />
          </div>
          {!resultados && (
            <nav className="flex flex-wrap gap-2 text-sm" aria-label="Seções da ajuda">
              {ANCORAS.map((a) => <a key={a.id} href={`#${a.id}`} className="rounded-full border px-3 py-1 hover:bg-muted/50" style={{ borderColor: "var(--via-border)", color: "var(--via-text-body)" }}>{a.rotulo}</a>)}
            </nav>
          )}
        </header>

        {resultados ? (
          totalResultados === 0 ? (
            <EmptyState icon={Search} title="Nenhum resultado" description={<>Nada encontrado para <span className="font-medium">“{query}”</span>. Pergunte ao assistente, ele consulta os dados da sua conta.</>} />
          ) : (
            <div className="space-y-6" data-testid="ajuda-resultados">
              {resultados.guias.length > 0 && (
                <section className="space-y-3">
                  <Titulo icone={BookOpen}>Guias</Titulo>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{resultados.guias.map((g) => <CartaoGuia key={g.id} guia={g} onAbrir={() => abrirGuia(g.id)} />)}</div>
                </section>
              )}
              {resultados.problemas.length > 0 && (
                <section className="space-y-3">
                  <Titulo icone={Wrench}>Resolver problemas</Titulo>
                  <div className="via-card px-5"><Accordion type="single" collapsible>{resultados.problemas.map((p) => <ItemProblema key={p.id} p={p} />)}</Accordion></div>
                </section>
              )}
              {resultados.faqs.length > 0 && (
                <section className="space-y-3">
                  <Titulo icone={HelpCircle}>Perguntas frequentes</Titulo>
                  <div className="via-card px-5">
                    <Accordion type="single" collapsible>
                      {resultados.faqs.map((f, i) => (
                        <AccordionItem key={i} value={`r-${i}`}>
                          <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                          <AccordionContent className="text-sm" style={{ color: "var(--via-text-body)" }}>{f.a}</AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </section>
              )}
              {resultados.termos.length > 0 && (
                <section className="space-y-3">
                  <Titulo icone={BookOpen}>Glossário</Titulo>
                  <dl className="via-card grid gap-3 p-5 sm:grid-cols-2">{resultados.termos.map((t) => <div key={t.termo}><dt className="text-sm font-medium">{t.termo}</dt><dd className="text-sm" style={{ color: "var(--via-text-muted)" }}>{t.definicao}</dd></div>)}</dl>
                </section>
              )}
            </div>
          )
        ) : (
          <>
            <AssistenteCaixa />

            <StatusDaConta />

            <section className="space-y-3" data-testid="ajuda-como-funciona">
              <Titulo icone={LifeBuoy}>Como a plataforma funciona</Titulo>
              <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visaoGeral.passos.map((p, i) => (
                  <li key={i} className="via-card flex gap-3 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ background: "var(--via-navy)", color: "var(--via-white)" }}>{i + 1}</span>
                    <div className="space-y-1 text-sm" style={{ color: "var(--via-text-body)" }}>
                      <p>{p.texto}</p>
                      {p.link && <Link to={p.link.to} className="inline-flex items-center gap-1 text-xs font-medium text-via-blue hover:underline">{p.link.rotulo} <ArrowRight className="h-3 w-3" strokeWidth={1.5} /></Link>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="space-y-5">
              <Titulo id="guias" icone={BookOpen}>Guias passo a passo</Titulo>
              {CAPITULOS.map((cap) => {
                const lista = GUIAS.filter((g) => g.capitulo === cap && g.id !== "visao-geral");
                if (!lista.length) return null;
                return (
                  <div key={cap} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--via-text-muted)" }}>{cap}</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{lista.map((g) => <CartaoGuia key={g.id} guia={g} onAbrir={() => abrirGuia(g.id)} />)}</div>
                  </div>
                );
              })}
            </section>

            <section className="space-y-3">
              <Titulo id="problemas" icone={Wrench}>Resolver problemas</Titulo>
              <div className="via-card px-5"><Accordion type="single" collapsible>{PROBLEMAS.map((p) => <ItemProblema key={p.id} p={p} />)}</Accordion></div>
            </section>

            <section className="space-y-3">
              <Titulo id="perguntas" icone={HelpCircle}>Perguntas frequentes</Titulo>
              <div className="grid gap-4 lg:grid-cols-2">
                {FAQ_SECOES.map((s) => (
                  <div key={s.id} className="via-card p-5">
                    <p className="mb-1 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}><s.icon className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} /> {s.title}</p>
                    <Accordion type="single" collapsible>
                      {s.faqs.map((f, i) => (
                        <AccordionItem key={i} value={`${s.id}-${i}`}>
                          <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                          <AccordionContent className="text-sm" style={{ color: "var(--via-text-body)" }}>{f.a}</AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <Titulo id="glossario" icone={BookOpen}>Glossário</Titulo>
              <dl className="via-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {GLOSSARIO.map((t) => <div key={t.termo}><dt className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{t.termo}</dt><dd className="text-sm" style={{ color: "var(--via-text-muted)" }}>{t.definicao}</dd></div>)}
              </dl>
            </section>

            <section className="via-card flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Ainda com dúvida?</p>
                <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Fale com o suporte em <a href="mailto:suporte@viverdeia.ai" className="font-medium text-via-blue hover:underline">suporte@viverdeia.ai</a> ou refaça o onboarding.</p>
              </div>
              <Link to="/settings/inicio" className="text-sm font-medium text-via-blue hover:underline">Ir para Primeiros passos</Link>
            </section>
          </>
        )}
      </div>
      <GuiaDetalhe guia={guiaAberto} onClose={() => abrirGuia(null)} />
    </AppShell>
  );
}
