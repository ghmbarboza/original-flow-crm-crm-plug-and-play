import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ColorPicker } from "@/components/contacts/TagsPanel";
import { useCreateStage, useUpdateStage } from "@/hooks/usePipelineStages";
import type { PipelineStage } from "@/hooks/useDeals";
import { MAX_NOME_ETAPA, PROBABILIDADE_MAXIMA, lerProbabilidade, validarNomeEtapa } from "@/lib/etapasFunil";
import { VIA_STAGE_COLORS } from "@/lib/via-colors";

interface Props {
  /** Etapa em edição; null cria uma etapa nova no fim do funil. */
  etapa: PipelineStage | null;
  etapas: PipelineStage[];
  pipelineId: string;
  onClose: () => void;
}

/**
 * Cria ou edita uma etapa: nome, cor e probabilidade de ganho. Montado só
 * enquanto aberto, então cada abertura parte dos dados da etapa.
 */
export function StageFormDialog({ etapa, etapas, pipelineId, onClose }: Props) {
  const criar = useCreateStage();
  const atualizar = useUpdateStage();
  const [nome, setNome] = useState(etapa?.name ?? "");
  const [cor, setCor] = useState<string>(etapa?.color ?? VIA_STAGE_COLORS[0].value);
  // Etapa nova começa sem número: quem cria escolhe, não herda 100% por ser a última.
  const [probabilidade, setProbabilidade] = useState(etapa ? String(etapa.win_probability) : "");

  const outrosNomes = etapas.filter((e) => e.id !== etapa?.id).map((e) => e.name);
  const erroNome = validarNomeEtapa(nome, outrosNomes);
  const probabilidadeLida = lerProbabilidade(probabilidade);
  const salvando = criar.isPending || atualizar.isPending;

  const handleSalvar = async () => {
    if (erroNome || probabilidadeLida === null) return;
    const dados = { name: nome.trim(), color: cor, win_probability: probabilidadeLida };
    try {
      if (etapa) await atualizar.mutateAsync({ id: etapa.id, ...dados });
      // Depois da maior posição existente: excluir etapa deixa buraco na numeração.
      else await criar.mutateAsync({ ...dados, pipelineId, order: Math.max(-1, ...etapas.map((e) => e.order)) + 1 });
      toast.success(etapa ? "Etapa atualizada." : "Etapa criada.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a etapa.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="stage-form-dialog">
        <DialogHeader>
          <DialogTitle>{etapa ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          <DialogDescription>
            {etapa
              ? "O novo nome e a nova cor aparecem no Kanban e em todos os negócios desta etapa."
              : "A etapa entra no fim do funil. Depois é só arrastar para a posição certa."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stage-name">Nome</Label>
            <Input
              id="stage-name"
              data-testid="stage-name"
              value={nome}
              maxLength={MAX_NOME_ETAPA}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Proposta enviada"
              autoFocus
            />
            {nome && erroNome && (
              <p className="text-xs text-via-coral" role="alert">{erroNome}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <ColorPicker value={cor} onChange={setCor} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stage-probability">Probabilidade de ganho (%)</Label>
            <Input
              id="stage-probability"
              data-testid="stage-probability"
              type="number"
              min="0"
              max={PROBABILIDADE_MAXIMA}
              className="w-32"
              value={probabilidade}
              onChange={(e) => setProbabilidade(e.target.value)}
              placeholder="0 a 100"
            />
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              O negócio assume essa probabilidade ao entrar na etapa, e a previsão de receita usa esse número.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={!!erroNome || probabilidadeLida === null || salvando} data-testid="stage-form-salvar">
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
