import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName: string;
  missing: string[];
}

/**
 * Modal exibido quando uma movimentação de deal é bloqueada por campos
 * obrigatórios da etapa de destino (Parte 5 do Sprint 10A). Só informa o que
 * falta; o preenchimento acontece na ficha do negócio ou do contato.
 */
export function RequiredFieldsDialog({ open, onOpenChange, stageName, missing }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="required-fields-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleAlert className="h-5 w-5 shrink-0" strokeWidth={1.5} aria-hidden />
            Campos obrigatórios para "{stageName}"
          </DialogTitle>
          <DialogDescription>
            Preencha os campos abaixo antes de mover o negócio para esta etapa.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--via-text-primary)" }}>
          {missing.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} data-testid="required-fields-fechar">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
