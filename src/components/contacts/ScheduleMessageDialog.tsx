import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useScheduleMessage } from "@/hooks/useScheduledMessages";
import { useContact } from "@/hooks/useContacts";
import { VARIAVEIS_MENSAGEM, valoresDoContato } from "@/lib/messageVars";
import { CampoComVariaveis } from "@/components/CampoComVariaveis";

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

  const valores = valoresDoContato(contato);


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
          <CampoComVariaveis
            id="agendar-mensagem"
            label="Mensagem"
            value={mensagem}
            onChange={setMensagem}
            variaveis={VARIAVEIS_MENSAGEM}
            valores={valores}
            placeholder="Olá {{contact.first_name}}! Passando para lembrar…"
            testId="agendar-mensagem"
          />
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
