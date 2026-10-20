import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  podeIniciarConversa, rotuloDaConta, useChannelAccounts, useSetNotificationsAccount,
} from "@/hooks/useChannelAccounts";

const AUTOMATICO = "__auto__";

/**
 * Notificações > Preferências (admin): por qual número saem os avisos de
 * WhatsApp para a equipe e os lembretes de reunião ao contato. "Automático"
 * segue a regra do backend (primeiro número que pode iniciar conversa, na
 * ordem Evolution > Meta > Zernio).
 */
export function NotificationsAccountSelect() {
  const { data: contas, isLoading } = useChannelAccounts();
  const definir = useSetNotificationsAccount();
  const whatsapp = (contas ?? []).filter((c) => c.is_active && c.channel === "whatsapp");
  const atual = whatsapp.find((c) => c.notifications_default)?.id ?? AUTOMATICO;
  // No automático só sai aviso por número que pode iniciar conversa. Com todos
  // "Só responde" (o padrão de número novo), nenhum aviso de WhatsApp sai.
  const semRemetente = atual === AUTOMATICO && whatsapp.length > 0 && !whatsapp.some(podeIniciarConversa);

  const trocar = async (valor: string) => {
    try {
      await definir.mutateAsync(valor === AUTOMATICO ? null : valor);
      toast.success(valor === AUTOMATICO ? "Os avisos voltam a sair pelo número automático." : "Número dos avisos atualizado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="via-card space-y-2 p-4" data-testid="notifications-account">
      <Label htmlFor="notifications-account-select">Número que envia os avisos de WhatsApp</Label>
      {whatsapp.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nenhum número de WhatsApp conectado. Conecte um em{" "}
          <Link to="/settings/integrations?integration=channels" className="underline">Integrações › Canais</Link>.
        </p>
      ) : (
        <>
          <Select value={atual} onValueChange={trocar} disabled={definir.isPending}>
            <SelectTrigger id="notifications-account-select" className="sm:max-w-md" aria-label="Número que envia os avisos">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTOMATICO}>Automático (primeiro número que pode iniciar conversa)</SelectItem>
              {whatsapp.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {rotuloDaConta(c)}{podeIniciarConversa(c) ? "" : " (só responde)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Vale para a organização inteira: avisos à equipe, lembretes de reunião e aviso de não comparecimento.
          </p>
          {semRemetente && (
            <p className="text-xs text-destructive" data-testid="notifications-account-sem-remetente">
              Hoje nenhum aviso sai pelo WhatsApp: todos os números estão como “Só responde”. Escolha um número acima
              ou mude o papel de um deles em Integrações › Canais.
            </p>
          )}
        </>
      )}
    </div>
  );
}
