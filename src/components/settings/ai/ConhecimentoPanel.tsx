import { useState } from "react";
import { toast } from "sonner";
import { Archive, CheckCircle2, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { CATEGORIAS_FATO, STATUS_DOCUMENTO_LABEL, type StatusDocumento } from "@/lib/conhecimento";
import { EXTENSOES_ACEITAS, MAX_ARQUIVOS, extrairMaterial } from "@/lib/extracaoMaterial";
import {
  useDeleteKnowledgeDocument, useDeleteKnowledgeFact, useKnowledgeDocuments, useKnowledgeFacts, useResolveUnanswered,
  useSaveKnowledgeDocument, useSaveKnowledgeFact, useSearchKnowledge, useSetDocumentStatus, useUnansweredQuestions,
  type EntradaFato, type KnowledgeFact, type ResultadoBusca, type UnansweredQuestion,
} from "@/hooks/useConhecimento";

const TIPO_RESULTADO: Record<string, string> = { fact: "Fato", chunk: "Documento", faq: "FAQ", objection: "Objeção" };

function erro(e: unknown, padrao: string) {
  toast.error(e instanceof Error ? e.message : padrao);
}

/** IA > Conhecimento > Documentos: texto colado ou arquivo extraído no navegador. */
export function DocumentosPanel() {
  const { data: documentos, isLoading } = useKnowledgeDocuments();
  const salvar = useSaveKnowledgeDocument();
  const mudarStatus = useSetDocumentStatus();
  const apagar = useDeleteKnowledgeDocument();
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [extraindo, setExtraindo] = useState(false);

  const salvarTexto = async () => {
    try {
      const doc = await salvar.mutateAsync({ title: titulo, content: texto, docType: "texto" });
      setTitulo("");
      setTexto("");
      toast.success(`"${doc.title}" salvo com ${doc.chunk_count} trecho${doc.chunk_count === 1 ? "" : "s"}.`);
    } catch (e) {
      erro(e, "Não foi possível salvar o material.");
    }
  };

  const enviarArquivos = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const arquivos = Array.from(lista).slice(0, MAX_ARQUIVOS);
    setExtraindo(true);
    try {
      for (const arquivo of arquivos) {
        const m = await extrairMaterial(arquivo);
        const doc = await salvar.mutateAsync({
          title: arquivo.name.replace(/\.[^.]+$/, ""), content: m.texto, docType: "arquivo", fileName: arquivo.name, partesIlegiveis: m.partesIlegiveis,
        });
        if (doc.status === "error") toast.error(`"${arquivo.name}": não foi possível ler o texto.`);
        else toast.success(`"${arquivo.name}": ${doc.chunk_count} trecho${doc.chunk_count === 1 ? "" : "s"}${m.partesIlegiveis.length ? `, ${m.partesIlegiveis.length} aviso(s)` : ""}.`);
      }
    } catch (e) {
      erro(e, "Não foi possível ler o arquivo.");
    } finally {
      setExtraindo(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="knowledge-documents">
      <div className="via-card space-y-3 p-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Adicionar material</h3>
        </div>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Catálogos, políticas, contratos, manuais. O texto é dividido em trechos e a IA busca neles quando o cliente pergunta algo que não está nos fatos.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="doc-titulo">Título</Label>
            <Input id="doc-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Política de troca" data-testid="doc-title" />
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm" style={{ borderColor: "var(--via-border)", color: "var(--via-text-body)" }}>
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            {extraindo ? "Lendo o arquivo…" : "Enviar arquivos (PDF, DOCX, XLSX, CSV, TXT)"}
            <input type="file" multiple accept={EXTENSOES_ACEITAS.join(",")} className="sr-only" disabled={extraindo} onChange={(e) => { void enviarArquivos(e.target.files); e.target.value = ""; }} data-testid="doc-file" />
          </label>
        </div>
        <div className="space-y-1">
          <Label htmlFor="doc-texto">Ou cole o texto</Label>
          <Textarea id="doc-texto" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="doc-content" />
        </div>
        <Button size="sm" onClick={salvarTexto} disabled={salvar.isPending || !titulo.trim() || !texto.trim()} data-testid="doc-save">
          <Plus className="mr-1 h-4 w-4" strokeWidth={1.5} /> Salvar material
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-16 w-full" /> : (documentos ?? []).length === 0 ? (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhum material ainda.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--via-border)" }} data-testid="doc-list">
          {(documentos ?? []).map((d) => {
            const avisos = ((d.ingestion_report as { partes_ilegiveis?: string[] } | null)?.partes_ilegiveis ?? []);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`doc-${d.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{d.title}</p>
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                    {d.file_name ?? d.doc_type} · {d.chunk_count} trecho{d.chunk_count === 1 ? "" : "s"} · {formatDateTime(d.updated_at)}
                    {d.error_message ? ` · ${d.error_message}` : ""}{avisos.length ? ` · ${avisos.join("; ")}` : ""}
                  </p>
                </div>
                <Badge variant={d.status === "approved" ? "default" : "secondary"}>{STATUS_DOCUMENTO_LABEL[d.status as StatusDocumento] ?? d.status}</Badge>
                {d.status === "needs_review" && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => mudarStatus.mutateAsync({ id: d.id, status: "approved" }).catch((e) => erro(e, "Falhou"))}>
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} /> Aprovar
                  </Button>
                )}
                {d.status === "approved" && (
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => mudarStatus.mutateAsync({ id: d.id, status: "archived" }).catch((e) => erro(e, "Falhou"))}>
                    <Archive className="h-4 w-4" strokeWidth={1.5} /> Arquivar
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => apagar.mutateAsync(d.id).catch((e) => erro(e, "Falhou"))} aria-label={`Apagar ${d.title}`} data-testid="doc-delete">
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const FATO_VAZIO: EntradaFato = { title: "", category: "geral", question: "", fact: "", always_include: true, status: "confirmed", expires_at: null };

/** IA > Conhecimento > Fatos: informações confirmadas que entram sempre no prompt. */
export function FatosPanel({ inicial, aoSalvar }: { inicial?: Partial<EntradaFato>; aoSalvar?: (f: KnowledgeFact) => void } = {}) {
  const { data: fatos, isLoading } = useKnowledgeFacts();
  const salvar = useSaveKnowledgeFact();
  const apagar = useDeleteKnowledgeFact();
  const [editando, setEditando] = useState<EntradaFato | null>(inicial ? { ...FATO_VAZIO, ...inicial } : null);

  const gravar = async () => {
    if (!editando) return;
    try {
      const f = await salvar.mutateAsync(editando);
      setEditando(null);
      aoSalvar?.(f);
      toast.success("Fato salvo.");
    } catch (e) {
      erro(e, "Não foi possível salvar o fato.");
    }
  };

  return (
    <div className="space-y-4" data-testid="knowledge-facts">
      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
        Preços, prazos, endereço, horários, políticas. Fatos marcados como "sempre no prompt" vão em toda resposta; os demais são encontrados pela busca.
      </p>
      {!editando && (
        <Button size="sm" variant="outline" onClick={() => setEditando({ ...FATO_VAZIO })} data-testid="fact-new"><Plus className="mr-1 h-4 w-4" strokeWidth={1.5} /> Novo fato</Button>
      )}
      {editando && (
        <div className="via-card grid gap-3 p-5 sm:grid-cols-2" data-testid="fact-form">
          <div className="space-y-1">
            <Label htmlFor="fato-titulo">Título</Label>
            <Input id="fato-titulo" value={editando.title} onChange={(e) => setEditando({ ...editando, title: e.target.value })} placeholder="Prazo de entrega" data-testid="fact-title" />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select value={editando.category} onValueChange={(v) => setEditando({ ...editando, category: v })}>
              <SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIAS_FATO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="fato-pergunta">Pergunta que o cliente faz (opcional)</Label>
            <Input id="fato-pergunta" value={editando.question ?? ""} onChange={(e) => setEditando({ ...editando, question: e.target.value })} placeholder="Quanto tempo demora a entrega?" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="fato-texto">Fato (exatamente como a IA deve dizer)</Label>
            <Textarea id="fato-texto" rows={3} value={editando.fact} onChange={(e) => setEditando({ ...editando, fact: e.target.value })} data-testid="fact-text" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={editando.always_include} onCheckedChange={(v) => setEditando({ ...editando, always_include: v })} aria-label="Sempre no prompt" />
            <Label>Sempre no prompt</Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fato-validade">Válido até (opcional)</Label>
            <Input id="fato-validade" type="date" value={editando.expires_at?.slice(0, 10) ?? ""} onChange={(e) => setEditando({ ...editando, expires_at: e.target.value ? `${e.target.value}T23:59:59` : null })} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" onClick={gravar} disabled={salvar.isPending || !editando.title.trim() || !editando.fact.trim()} data-testid="fact-save">Salvar fato</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
          </div>
        </div>
      )}
      {isLoading ? <Skeleton className="h-16 w-full" /> : (fatos ?? []).length === 0 ? (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhum fato ainda.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--via-border)" }} data-testid="fact-list">
          {(fatos ?? []).map((f) => (
            <li key={f.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{f.title} <span className="text-xs font-normal" style={{ color: "var(--via-text-muted)" }}>· {f.category}</span></p>
                {f.question && <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{f.question}</p>}
                <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{f.fact}</p>
              </div>
              {f.always_include && <Badge variant="secondary">sempre no prompt</Badge>}
              {f.status !== "confirmed" && <Badge variant="outline">revisar</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setEditando({ id: f.id, title: f.title, category: f.category, question: f.question, fact: f.fact, always_include: f.always_include, status: f.status === "confirmed" ? "confirmed" : "needs_review", expires_at: f.expires_at })}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => apagar.mutateAsync(f.id).catch((e) => erro(e, "Falhou"))} aria-label={`Apagar ${f.title}`}><Trash2 className="h-4 w-4" strokeWidth={1.5} /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** IA > Conhecimento > Pendências: perguntas que a IA não soube responder. */
export function PendenciasPanel() {
  const { data: pendencias, isLoading } = useUnansweredQuestions();
  const resolver = useResolveUnanswered();
  const [virandoFato, setVirandoFato] = useState<UnansweredQuestion | null>(null);

  if (virandoFato) {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>Responda a pergunta como um fato. A pendência é fechada ao salvar.</p>
        <FatosPanel
          inicial={{ title: virandoFato.question.slice(0, 80), question: virandoFato.question, fact: "", always_include: false }}
          aoSalvar={(f) => { resolver.mutateAsync({ id: virandoFato.id, status: "resolved", factId: f.id }).catch((e) => erro(e, "Falhou")); setVirandoFato(null); }}
        />
        <Button size="sm" variant="ghost" onClick={() => setVirandoFato(null)}>Voltar às pendências</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="knowledge-unanswered">
      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
        Cada vez que a IA diz "vou confirmar com a equipe", a pergunta cai aqui. Vire fato para a próxima resposta sair certa.
      </p>
      {isLoading ? <Skeleton className="h-16 w-full" /> : (pendencias ?? []).length === 0 ? (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhuma pendência. A IA respondeu tudo com a base atual.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--via-border)" }}>
          {(pendencias ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-start gap-3 py-3" data-testid={`unanswered-${p.id}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm" style={{ color: "var(--via-text-primary)" }}>{p.question}</p>
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{formatDateTime(p.created_at)}{p.context ? ` · ${p.context}` : ""}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setVirandoFato(p)} data-testid="unanswered-to-fact">Virar fato</Button>
              <Button size="sm" variant="ghost" onClick={() => resolver.mutateAsync({ id: p.id, status: "ignored" }).catch((e) => erro(e, "Falhou"))}>Ignorar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** IA > Conhecimento > Testar busca: o que a IA encontraria para uma pergunta. */
export function BuscaPanel() {
  const buscar = useSearchKnowledge();
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null);

  const rodar = async () => {
    try {
      setResultados(await buscar.mutateAsync(consulta));
    } catch (e) {
      erro(e, "A busca falhou.");
    }
  };

  return (
    <div className="space-y-3" data-testid="knowledge-search">
      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Digite como um cliente perguntaria. A busca tolera erros de digitação e sinônimos.</p>
      <div className="flex gap-2">
        <Input value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="qual o prazo de entrega?" onKeyDown={(e) => { if (e.key === "Enter") void rodar(); }} data-testid="search-input" />
        <Button size="sm" onClick={rodar} disabled={buscar.isPending || !consulta.trim()} data-testid="search-run"><Search className="mr-1 h-4 w-4" strokeWidth={1.5} /> Buscar</Button>
      </div>
      {resultados && (resultados.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }} data-testid="search-empty">Nada encontrado. Nesse caso a IA diria que vai confirmar com a equipe e registraria a pendência.</p>
      ) : (
        <ul className="space-y-2" data-testid="search-results">
          {resultados.map((r) => (
            <li key={`${r.source_type}-${r.source_id}`} className="via-card p-3">
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{TIPO_RESULTADO[r.source_type] ?? r.source_type} · {r.title}</p>
              <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{r.content.length > 400 ? `${r.content.slice(0, 400)}…` : r.content}</p>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
