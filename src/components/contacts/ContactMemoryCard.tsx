import { useState } from "react";
import { toast } from "sonner";
import { Brain, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { CAMPOS_LEAD, ROTULO_CAMPO, STATUS_LABEL, temAlgo, type ChaveCampo } from "@/lib/clientMemory";
import { useClientMemory, useConfirmMemoryField } from "@/hooks/useClientMemory";

/**
 * Ficha do contato > "O que a IA sabe": campos extraídos das conversas com a
 * origem (inferido ou confirmado). Editar um campo confirma o valor e a IA
 * deixa de sobrescrevê-lo.
 */
export function ContactMemoryCard({ contactId }: { contactId: string }) {
  const { data: memoria, isLoading } = useClientMemory(contactId);
  const confirmar = useConfirmMemoryField(contactId);
  const [editando, setEditando] = useState<{ chave: ChaveCampo; valor: string } | null>(null);

  const salvar = async () => {
    if (!editando || !memoria) return;
    try {
      await confirmar.mutateAsync({ memoria, chave: editando.chave, valor: editando.valor });
      setEditando(null);
      toast.success("Informação confirmada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  if (isLoading || !memoria) return <Skeleton className="h-24 w-full" />;
  const si = memoria.sales_intelligence;

  return (
    <div className="via-card space-y-3 p-5" data-testid="contact-memory">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
          <Brain className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} /> O que a IA sabe
        </h2>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--via-text-muted)" }}>
          {si.score !== null && <Badge variant={si.score >= 70 ? "default" : "secondary"} data-testid="memory-score">Score {si.score}</Badge>}
          {memoria.interaction_summary.last_analyzed_at ? `analisado ${formatDateTime(memoria.interaction_summary.last_analyzed_at)}` : "ainda sem análise"}
        </div>
      </div>
      {!temAlgo(memoria) ? (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>A IA ainda não extraiu nada das conversas deste contato. Preencha um campo para confirmar o que você já sabe.</p>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2">
        {CAMPOS_LEAD.map((k) => {
          const c = memoria.lead_state[k];
          const emEdicao = editando?.chave === k;
          return (
            <li key={k} className="rounded-md border p-2" style={{ borderColor: "var(--via-border)" }} data-testid={`memory-${k}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>{ROTULO_CAMPO[k]}</span>
                {!emEdicao && (
                  <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setEditando({ chave: k, valor: c?.value ?? "" })} aria-label={`Editar ${ROTULO_CAMPO[k]}`}>
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                )}
              </div>
              {emEdicao ? (
                <div className="mt-1 flex items-center gap-1">
                  <Input value={editando.valor} onChange={(e) => setEditando({ chave: k, valor: e.target.value })} className="h-8" data-testid={`memory-input-${k}`} onKeyDown={(e) => { if (e.key === "Enter") void salvar(); }} />
                  <Button size="sm" className="h-8" onClick={salvar} disabled={confirmar.isPending} aria-label="Confirmar" data-testid={`memory-save-${k}`}><Check className="h-4 w-4" strokeWidth={1.5} /></Button>
                </div>
              ) : (
                <p className="text-sm" style={{ color: c?.value ? "var(--via-text-primary)" : "var(--via-text-muted)" }}>
                  {c?.value ?? "não sabemos"}
                  {c?.value && <span className="ml-1 text-xs" style={{ color: c.status === "confirmed" ? "var(--via-success)" : "var(--via-text-muted)" }}>· {STATUS_LABEL[c.status]}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {(si.interests.length > 0 || si.pains.length > 0 || si.objections.length > 0 || si.summary) && (
        <div className="space-y-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          {si.interests.length > 0 && <p><span style={{ color: "var(--via-text-muted)" }}>Interesses:</span> {si.interests.join(", ")}</p>}
          {si.pains.length > 0 && <p><span style={{ color: "var(--via-text-muted)" }}>Dores:</span> {si.pains.join(", ")}</p>}
          {si.objections.length > 0 && <p><span style={{ color: "var(--via-text-muted)" }}>Objeções:</span> {si.objections.join(", ")}</p>}
          {si.summary && <p data-testid="memory-summary"><span style={{ color: "var(--via-text-muted)" }}>Resumo:</span> {si.summary}</p>}
        </div>
      )}
    </div>
  );
}
