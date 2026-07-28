import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORIAS_ERRO, aplicarSugestao, blockLabel, useDiagnoseAIError,
  type Diagnostico,
} from "@/hooks/useDiagnoseAI";
import { useAIConfig, useUpsertAIConfig } from "@/hooks/useAIConfig";

const CONFIANCA_LABEL: Record<string, string> = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
};

/**
 * Reporta uma resposta ruim da IA e mostra o diagnóstico.
 *
 * Duas telas no mesmo diálogo: primeiro a categoria do problema, depois o
 * resultado com a sugestão de correção.
 */
export function ReportAIResponseDialog({
  messageId,
  onOpenChange,
}: {
  messageId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: config } = useAIConfig();
  const diagnosticar = useDiagnoseAIError();
  const upsert = useUpsertAIConfig();

  const [categoria, setCategoria] = useState<string>("informacao_incorreta");
  const [descricao, setDescricao] = useState("");
  const [resultado, setResultado] = useState<Diagnostico | null>(null);
  const [sugestaoEditada, setSugestaoEditada] = useState("");
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (messageId) {
      setCategoria("informacao_incorreta");
      setDescricao("");
      setResultado(null);
      setSugestaoEditada("");
    }
  }, [messageId]);

  const analisar = async () => {
    if (!messageId) return;
    try {
      const r = await diagnosticar.mutateAsync({ messageId, categoria, descricao });
      setResultado(r);
      setSugestaoEditada(r.sugestao);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível diagnosticar.");
    }
  };

  const aplicar = async () => {
    if (!resultado || !config?.system_prompt) return;
    setAplicando(true);
    try {
      const novo = aplicarSugestao(config.system_prompt, resultado.bloco, sugestaoEditada);
      await upsert.mutateAsync({
        system_prompt: novo,
        versionNote: `Correção após resposta reportada (${blockLabel(resultado.bloco)})`,
      });
      toast.success("Prompt atualizado. Uma nova versão foi registrada no histórico.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível aplicar a correção.");
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Dialog open={!!messageId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="report-ai-dialog">
        {!resultado ? (
          <>
            <DialogHeader>
              <DialogTitle>O que estava errado nesta resposta?</DialogTitle>
              <DialogDescription>
                Vamos analisar o prompt da IA e sugerir uma correção.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-2">
                {CATEGORIAS_ERRO.map((c) => {
                  const ativo = categoria === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      data-testid="report-category"
                      onClick={() => setCategoria(c.value)}
                      className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors"
                      style={{
                        borderColor: ativo ? "var(--via-navy)" : "var(--via-border)",
                        background: ativo ? "var(--via-surface)" : "transparent",
                        color: "var(--via-text-primary)",
                      }}
                    >
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                        style={{ borderColor: ativo ? "var(--via-navy)" : "var(--via-border)" }}
                      >
                        {ativo && <Check className="h-3 w-3" strokeWidth={2.5} style={{ color: "var(--via-navy)" }} />}
                      </span>
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-desc">O que deveria ter acontecido? (opcional)</Label>
                <Textarea
                  id="report-desc"
                  rows={3}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Quanto mais específico, melhor a sugestão."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={analisar} disabled={diagnosticar.isPending} data-testid="report-analyze">
                {diagnosticar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />}
                {diagnosticar.isPending ? "Analisando…" : "Analisar e sugerir correção"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Diagnóstico da resposta</DialogTitle>
              <DialogDescription>
                Isto é uma hipótese da IA sobre o próprio prompt, não um diagnóstico definitivo.
                Revise antes de aplicar.
              </DialogDescription>
            </DialogHeader>

            <div className="via-scroll max-h-[55vh] space-y-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                  Bloco provável:
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ background: "var(--via-surface)", color: "var(--via-text-primary)" }}
                  data-testid="report-block"
                >
                  {blockLabel(resultado.bloco)}
                </span>
                {/* Confiança baixa é o caso comum: a UI não esconde isso. */}
                <span
                  className="inline-flex items-center gap-1 text-xs"
                  style={{
                    color: resultado.confianca === "alta"
                      ? "var(--via-success)"
                      : "var(--via-text-muted)",
                  }}
                >
                  {resultado.confianca !== "alta" && <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />}
                  {CONFIANCA_LABEL[resultado.confianca] ?? resultado.confianca}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  O que pode ter causado
                </p>
                <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{resultado.causa}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-suggestion">Sugestão de adição ao prompt</Label>
                <Textarea
                  id="report-suggestion"
                  rows={4}
                  data-testid="report-suggestion"
                  value={sugestaoEditada}
                  onChange={(e) => setSugestaoEditada(e.target.value)}
                />
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Aplicar insere este texto no bloco{" "}
                  <strong>{blockLabel(resultado.bloco)}</strong> e cria uma nova versão no histórico,
                  então dá para reverter.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Descartar</Button>
              <Button
                onClick={aplicar}
                disabled={aplicando || !sugestaoEditada.trim() || !config?.system_prompt}
                data-testid="report-apply"
              >
                {aplicando ? "Aplicando…" : "Aplicar ao prompt"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
