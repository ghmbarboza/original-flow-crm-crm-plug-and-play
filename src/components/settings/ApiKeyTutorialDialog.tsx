import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { BookOpen, ExternalLink, Info } from "lucide-react";
import { tutorialDoServico } from "@/lib/apiKeyTutorials";

interface Props {
  /** Nome do serviço digitado/escolhido (ex.: "elevenlabs"). */
  service: string;
  /** Variante do botão que abre o passo a passo. */
  variant?: "link" | "outline";
  /** Texto do botão, para quando há mais de um passo a passo lado a lado. */
  rotulo?: string;
}

/**
 * Passo a passo escrito, dentro do app, de como obter a chave de um serviço.
 * O link externo fica no rodapé como complemento, não como única saída.
 */
export function ApiKeyTutorialDialog({ service, variant = "link", rotulo = "Ver passo a passo" }: Props) {
  const [open, setOpen] = useState(false);
  const tutorial = tutorialDoServico(service);
  if (!tutorial) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={variant === "link" ? "ghost" : "outline"}
          className={variant === "link" ? "h-auto p-0 text-sm text-primary hover:bg-transparent hover:underline" : ""}
          data-testid="api-key-tutorial-trigger"
        >
          <BookOpen className="mr-1 h-3.5 w-3.5" /> {rotulo}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Como obter a chave de {tutorial.label}</DialogTitle>
          <DialogDescription>
            Leva poucos minutos. A chave fica guardada no Vault e não volta para a tela.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm" data-testid="api-key-tutorial-steps">
          {tutorial.passos.map((passo) => (
            <li key={passo}>{passo}</li>
          ))}
        </ol>
        {tutorial.aviso && (
          <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {tutorial.aviso}
          </p>
        )}
        <a
          href={tutorial.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Documentação oficial de {tutorial.label}
        </a>
      </DialogContent>
    </Dialog>
  );
}
