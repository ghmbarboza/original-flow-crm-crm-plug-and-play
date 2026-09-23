import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ANALYSIS_PADRAO, useAnalysisConfig, useSaveAnalysisConfig, useSaveStageCriteria, useStageCriteria, type AnalysisConfig } from "@/hooks/useClientMemory";

/**
 * IA > Análises: quando a IA analisa a conversa (1ª mensagem e a cada N),
 * confiança mínima para mexer na etapa e os critérios escritos por etapa.
 */
export function AnalysisSettingsPanel() {
  const { data: salvo, isLoading } = useAnalysisConfig();
  const salvar = useSaveAnalysisConfig();
  const { data: etapas, isLoading: carregandoEtapas } = useStageCriteria();
  const salvarCriterio = useSaveStageCriteria();
  const [cfg, setCfg] = useState<AnalysisConfig>(ANALYSIS_PADRAO);
  const [criterios, setCriterios] = useState<Record<string, string>>({});

  useEffect(() => { if (salvo) setCfg(salvo); }, [salvo]);
  useEffect(() => {
    if (etapas) setCriterios(Object.fromEntries(etapas.map((e) => [e.id, e.ai_trigger_criteria ?? ""])));
  }, [etapas]);

  const gravar = async () => {
    try {
      await salvar.mutateAsync({ enabled: cfg.enabled, every_messages: Math.max(1, Math.min(50, cfg.every_messages)), min_confidence: Math.max(0, Math.min(100, cfg.min_confidence)) });
      toast.success("Configuração da análise salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };
  const gravarCriterio = async (id: string) => {
    try {
      await salvarCriterio.mutateAsync({ id, criteria: criterios[id] ?? "" });
      toast.success("Critério salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-6" data-testid="ai-analysis">
      <div className="via-card space-y-4 p-5">
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Análise pós-conversa</h3>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Depois de responder, a IA relê a conversa e anota o que descobriu do cliente (empresa, cargo, dor, orçamento, prazo, interesses, objeções, score). O resultado aparece na ficha do contato em "O que a IA sabe", preenche o BANT do negócio aberto quando está vazio e pontua o lead quando o score chega a 70.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} aria-label="Análise ligada" data-testid="analysis-enabled" />
          <Label>Analisar as conversas automaticamente</Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="an-every">Analisar na 1ª mensagem e depois a cada quantas mensagens do cliente</Label>
            <Input id="an-every" type="number" min={1} max={50} value={cfg.every_messages} onChange={(e) => setCfg({ ...cfg, every_messages: Number(e.target.value) || 5 })} data-testid="analysis-every" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="an-conf">Confiança mínima para mexer na etapa (0 a 100)</Label>
            <Input id="an-conf" type="number" min={0} max={100} value={cfg.min_confidence} onChange={(e) => setCfg({ ...cfg, min_confidence: Number(e.target.value) || 70 })} data-testid="analysis-confidence" />
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Se a análise bater com o critério de uma etapa, a IA move o negócio (modo "mover" em Ações no funil) ou só sugere para a equipe (modo "sugerir").
        </p>
        <Button size="sm" onClick={gravar} disabled={salvar.isPending} data-testid="analysis-save">Salvar</Button>
      </div>

      <div className="via-card space-y-3 p-5">
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Critérios por etapa</h3>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Escreva, em linguagem natural, o que precisa ter acontecido na conversa para o negócio estar nesta etapa. Etapa sem critério a IA não considera.</p>
        </div>
        {carregandoEtapas ? <Skeleton className="h-20 w-full" /> : (etapas ?? []).map((e) => (
          <div key={e.id} className="space-y-1" data-testid={`criteria-${e.id}`}>
            <Label htmlFor={`crit-${e.id}`}>{e.name}</Label>
            <div className="flex items-start gap-2">
              <Textarea id={`crit-${e.id}`} rows={2} value={criterios[e.id] ?? ""} onChange={(ev) => setCriterios({ ...criterios, [e.id]: ev.target.value })} placeholder="Ex.: o cliente confirmou orçamento e pediu proposta" />
              <Button size="sm" variant="outline" onClick={() => gravarCriterio(e.id)} disabled={salvarCriterio.isPending || (criterios[e.id] ?? "") === (e.ai_trigger_criteria ?? "")}>Salvar</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
