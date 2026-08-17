import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Info, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  lossReasonsForSector, pipelineForSector, useApplyPipeline, useDealCount,
  useOrganization, useSaveSetupStep,
} from "@/hooks/useSetup";
import { PularEtapa } from "@/components/setup/PularEtapa";

/** Funil mínimo aplicado quando o usuário pula: sem etapas, o kanban quebra. */
const FUNIL_DEFAULT = ["Prospecção", "Qualificação", "Proposta", "Fechamento"];

export function StepPipeline({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data: org } = useOrganization();
  const { data: dealCount } = useDealCount();
  const aplicar = useApplyPipeline();
  const salvarEtapa = useSaveSetupStep();

  const [etapas, setEtapas] = useState<string[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [novaEtapa, setNovaEtapa] = useState("");
  const [novoMotivo, setNovoMotivo] = useState("");

  // Sugere UMA vez. Sem a trava, um refetch da organização descartava as etapas
  // que o usuário tinha acabado de renomear, reordenar ou remover, voltando
  // tudo para a sugestão padrão do setor.
  const sugerido = useRef(false);
  useEffect(() => {
    if (!org || sugerido.current) return;
    sugerido.current = true;
    setEtapas(pipelineForSector(org.business_sector));
    setMotivos(lossReasonsForSector(org.business_sector));
  }, [org]);

  const mover = (i: number, delta: number) => {
    const destino = i + delta;
    if (destino < 0 || destino >= etapas.length) return;
    const copia = [...etapas];
    [copia[i], copia[destino]] = [copia[destino], copia[i]];
    setEtapas(copia);
  };

  const temDeals = (dealCount ?? 0) > 0;

  const avancar = async () => {
    const limpas = etapas.map((e) => e.trim()).filter(Boolean);
    if (limpas.length === 0) {
      toast.error("Defina ao menos uma etapa.");
      return;
    }
    try {
      const r = await aplicar.mutateAsync({ stages: limpas, lossReasons: motivos });
      await salvarEtapa.mutateAsync({ step: "pipeline" });
      toast.success(
        r.substituiu
          ? `Pipeline criado com ${r.etapas} etapas.`
          : `Etapas renomeadas — seus ${dealCount} negócio(s) foram preservados.`,
      );
      onNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o pipeline.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          Como é seu processo de vendas?
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Sugerimos este funil para o seu setor. Renomeie, reordene ou remova o que não usa.
        </p>
      </div>

      {/* Aviso honesto: com negócios existentes, o wizard não apaga nada. */}
      {temDeals && (
        <div className="via-card flex items-start gap-2 p-3" data-testid="setup-pipeline-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            Você já tem <strong>{dealCount}</strong> negócio(s) no funil. Para não perder nenhum,
            vamos <strong>renomear</strong> as etapas existentes em vez de recriá-las. Nada será apagado.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Etapas do funil</Label>
        <div className="space-y-2">
          {etapas.map((etapa, i) => (
            <div key={i} className="flex items-center gap-2" data-testid="setup-stage-row">
              <span
                className="w-6 shrink-0 text-center text-xs tabular-nums"
                style={{ color: "var(--via-text-muted)" }}
              >
                {i + 1}
              </span>
              <Input
                value={etapa}
                data-testid="setup-stage-input"
                onChange={(e) => {
                  const copia = [...etapas];
                  copia[i] = e.target.value;
                  setEtapas(copia);
                }}
              />
              <Button size="icon" variant="ghost" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">
                <ArrowUp className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => mover(i, 1)} disabled={i === etapas.length - 1} aria-label="Descer">
                <ArrowDown className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEtapas(etapas.filter((_, k) => k !== i))}
                aria-label={`Remover ${etapa}`}
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Nova etapa"
            value={novaEtapa}
            data-testid="setup-new-stage"
            onChange={(e) => setNovaEtapa(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && novaEtapa.trim()) {
                e.preventDefault();
                setEtapas([...etapas, novaEtapa.trim()]);
                setNovaEtapa("");
              }
            }}
          />
          <Button
            variant="outline"
            className="gap-1.5 shrink-0"
            disabled={!novaEtapa.trim()}
            onClick={() => { setEtapas([...etapas, novaEtapa.trim()]); setNovaEtapa(""); }}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Adicionar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Motivos de perda</Label>
        <div className="flex flex-wrap gap-2">
          {motivos.map((m, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm"
              style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}
            >
              {m}
              <button
                type="button"
                onClick={() => setMotivos(motivos.filter((_, k) => k !== i))}
                aria-label={`Remover ${m}`}
              >
                <X className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Novo motivo"
            value={novoMotivo}
            onChange={(e) => setNovoMotivo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && novoMotivo.trim()) {
                e.preventDefault();
                setMotivos([...motivos, novoMotivo.trim()]);
                setNovoMotivo("");
              }
            }}
          />
          <Button
            variant="outline"
            className="gap-1.5 shrink-0"
            disabled={!novoMotivo.trim()}
            onClick={() => { setMotivos([...motivos, novoMotivo.trim()]); setNovoMotivo(""); }}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Adicionar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={aplicar.isPending}>Voltar</Button>
        <PularEtapa
          step="pipeline"
          impacto="Criamos um funil padrão simples; ajuste depois em Configurações > Automações > Funil."
          onPulado={onNext}
          disabled={aplicar.isPending}
          antesDePular={async () => {
            await aplicar.mutateAsync({
              stages: FUNIL_DEFAULT,
              lossReasons: lossReasonsForSector(org?.business_sector),
            });
          }}
        >
          <Button onClick={avancar} disabled={aplicar.isPending || etapas.length === 0} data-testid="setup-next">
            {aplicar.isPending ? "Salvando…" : "Avançar"}
          </Button>
        </PularEtapa>
      </div>
    </div>
  );
}
