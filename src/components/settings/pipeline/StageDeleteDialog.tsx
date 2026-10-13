import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteStage, useStageUsage } from "@/hooks/usePipelineStages";
import type { PipelineStage } from "@/hooks/useDeals";
import { efeitosDaExclusao, motivoDoBloqueio } from "@/lib/etapasFunil";

interface Props {
  etapa: PipelineStage;
  /** Última etapa do funil não pode sair: o Kanban ficaria sem coluna. */
  unica: boolean;
  onClose: () => void;
}

/**
 * Confirma a exclusão de uma etapa. Explica quando ela não pode ser excluída e,
 * quando pode, o que deixa de apontar para ela.
 */
export function StageDeleteDialog({ etapa, unica, onClose }: Props) {
  const excluir = useDeleteStage();
  const { data: uso, isLoading, error } = useStageUsage(etapa.id);

  const bloqueio = motivoDoBloqueio({ unica, uso, falhouConferir: !!error });
  const podeExcluir = !isLoading && !bloqueio;
  const efeitos = uso ? efeitosDaExclusao(uso) : [];

  const handleExcluir = async () => {
    try {
      await excluir.mutateAsync(etapa.id);
      toast.success("Etapa excluída.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a etapa.");
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-testid="stage-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir a etapa "{etapa.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {isLoading
              ? "Conferindo o que depende desta etapa…"
              : bloqueio ?? "A etapa sai do Kanban junto com a mensagem automática e os campos obrigatórios configurados nela. Não dá para desfazer."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {podeExcluir && efeitos.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--via-text-body)" }} data-testid="stage-delete-efeitos">
            {efeitos.map((efeito) => <li key={efeito}>{efeito}</li>)}
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{podeExcluir ? "Cancelar" : "Fechar"}</AlertDialogCancel>
          {podeExcluir && (
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleExcluir(); }}
              disabled={excluir.isPending}
              data-testid="stage-delete-confirmar"
            >
              Excluir etapa
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
