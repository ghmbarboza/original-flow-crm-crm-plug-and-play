import { useState } from "react";
import { Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Botão de desconectar padrão das integrações.
 *
 * Sempre com confirmação: desconectar é silencioso do lado de fora — ninguém
 * recebe um aviso de que o CRM parou de responder —, então o custo precisa
 * estar escrito ANTES do clique, não num toast depois.
 */
export function DesconectarIntegracao({
  titulo,
  consequencia,
  rotulo = "Desconectar",
  onConfirmar,
  disabled,
  testId,
}: {
  titulo: string;
  /** O que deixa de funcionar. Aparece no diálogo, antes de confirmar. */
  consequencia: string;
  rotulo?: string;
  onConfirmar: () => Promise<void> | void;
  disabled?: boolean;
  testId?: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive"
        onClick={() => setAberto(true)}
        disabled={disabled}
        data-testid={testId}
      >
        <Unplug className="h-3.5 w-3.5" strokeWidth={1.5} />
        {rotulo}
      </Button>

      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{titulo}</AlertDialogTitle>
            <AlertDialogDescription>{consequencia}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await onConfirmar();
                setAberto(false);
              }}
            >
              {rotulo}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
