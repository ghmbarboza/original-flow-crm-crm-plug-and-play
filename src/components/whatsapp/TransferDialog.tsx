import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import { useUpdateConversation } from "@/hooks/useConversations";

const QUEUE = "__queue__";

interface Props {
  conversationId: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Transfere a conversa para um agente específico ou de volta para a fila geral. */
export function TransferDialog({ conversationId, onOpenChange }: Props) {
  const { data: members } = useOrgMembers();
  const updateConversation = useUpdateConversation();
  const [target, setTarget] = useState<string>(QUEUE);

  const handleTransfer = async () => {
    if (!conversationId) return;
    try {
      await updateConversation.mutateAsync({
        id: conversationId,
        status: "human_takeover",
        // Fila geral: sem responsável definido; qualquer agente pode assumir.
        assigned_to: target === QUEUE ? null : target,
      });
      toast.success(target === QUEUE ? "Conversa devolvida à fila geral." : "Conversa transferida.");
      onOpenChange(false);
      setTarget(QUEUE);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível transferir a conversa.");
    }
  };

  return (
    <Dialog open={!!conversationId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir conversa</DialogTitle>
          <DialogDescription>
            Escolha um agente para assumir, ou devolva para a fila geral onde qualquer agente pode pegar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="transfer-target">Destino</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="transfer-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={QUEUE}>Fila geral</SelectItem>
              {(members ?? []).map((member) => (
                <SelectItem key={member.id} value={member.id}>{member.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleTransfer} disabled={updateConversation.isPending}>
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
