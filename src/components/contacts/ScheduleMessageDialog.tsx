import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useScheduleMessage } from "@/hooks/useScheduledMessages";
import { useContact } from "@/hooks/useContacts";
import { VARIAVEIS_MENSAGEM, renderVariaveis, valoresDoContato } from "@/lib/messageVars";

/** Valor inicial do datetime-local: daqui a 1h, arredondado ao quarto de hora. */
function daquiUmaHora(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  // datetime-local não aceita timezone: formata no fuso local, não em UTC.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Agenda uma mensagem avulsa para o contato (usado na ficha e no inbox).
 * O envio é do dispatcher (cron 5 min) — o horário real pode variar em até
 * 5 minutos, e o texto avisa isso em vez de prometer precisão que não existe.
 */
export function ScheduleMessageDialog({
  open,
  onOpenChange,
  contactId,
  conversationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  conversationId?: string | null;
}) {
  const agendar = useScheduleMessage();
  const { data: contato } = useContact(open ? contactId : null);
  const [quando, setQuando] = useState(daquiUmaHora);
  const [mensagem, setMensagem] = useState("");
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const valores = valoresDoContato(contato);
  const previa = renderVariaveis(mensagem, valores);

  /**
   * Insere a variável na posição do cursor, não no fim do texto.
   *
   * Quem já escreveu "Olá , tudo bem?" e volta o cursor para depois do "Olá"
   * espera a variável ali. Jogar no fim obrigaria a recortar e colar.
   */
  const inserirVariavel = (chave: string) => {
    const campo = campoRef.current;
    const token = `{{${chave}}}`;
    if (!campo) {
      setMensagem((m) => m + token);
      return;
    }
    const inicio = campo.selectionStart ?? mensagem.length;
    const fim = campo.selectionEnd ?? inicio;
    const novo = mensagem.slice(0, inicio) + token + mensagem.slice(fim);
    setMensagem(novo);
    // O cursor precisa ficar DEPOIS do que acabou de ser inserido, senão o
    // próximo clique empilha variáveis na ordem errada.
    requestAnimationFrame(() => {
      campo.focus();
      const pos = inicio + token.length;
      campo.setSelectionRange(pos, pos);
    });
  };

  const submeter = async () => {
    try {
      await agendar.mutateAsync({
        contactId,
        conversationId,
        message: mensagem,
        scheduledAt: quando,
      });
      toast.success("Mensagem agendada.");
      setMensagem("");
      setQuando(daquiUmaHora());
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível agendar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar mensagem</DialogTitle>
          <DialogDescription>
            Enviada pelo canal ativo do contato no horário escolhido (verificação a cada 5
            minutos). Aceita variáveis como {"{{contact.first_name}}"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agendar-quando">Data e hora</Label>
            <Input
              id="agendar-quando"
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              data-testid="agendar-quando"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agendar-mensagem">Mensagem</Label>
            <Textarea
              id="agendar-mensagem"
              ref={campoRef}
              rows={4}
              placeholder="Olá {{contact.first_name}}! Passando para lembrar…"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              data-testid="agendar-mensagem"
            />

            {/* Só estas três são substituídas no envio; ver messageVars.ts. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Inserir:
              </span>
              {VARIAVEIS_MENSAGEM.map((v) => (
                <Button
                  key={v.chave}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs font-normal"
                  onClick={() => inserirVariavel(v.chave)}
                  data-testid={`agendar-var-${v.chave}`}
                >
                  {v.rotulo}
                </Button>
              ))}
            </div>
          </div>

          {/* Prévia com os dados reais do contato: é a única forma de ver que
              "{{contact.lastname}}" (sem underline) sai vazio ANTES de o cliente
              receber a mensagem torta. */}
          {mensagem.trim() && (
            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Prévia — como {contato?.first_name || "o contato"} vai receber
              </Label>
              <div
                className="whitespace-pre-wrap rounded-lg p-3 text-sm"
                style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}
                data-testid="agendar-previa"
              >
                {previa}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submeter} disabled={agendar.isPending || !mensagem.trim()} data-testid="agendar-confirmar">
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
