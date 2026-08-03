import { useNavigate } from "react-router-dom";
import { ArrowRight, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntegrationHeader } from "@/components/settings/IntegrationHeader";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";
import { useEmailConnection } from "@/hooks/useEmailConnection";

/**
 * Atalhos no topo de Configurações > Integrações.
 *
 * Canais e Gmail SÃO integrações, mas moram em outras telas (aba Canais e o
 * Inbox) — quem abre "Integrações" procurando WhatsApp não achava nada e
 * concluía que a plataforma não tinha. Estes cards mostram propósito e status
 * sem mover nada de lugar.
 */
export default function IntegrationShortcuts() {
  const navigate = useNavigate();
  const { data: whatsapp } = useWhatsAppSetup();
  const { data: email } = useEmailConnection();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="via-card space-y-3 p-5">
        <IntegrationHeader
          icon={MessageSquare}
          title="Canais de atendimento (WhatsApp, Instagram…)"
          purpose="É por aqui que a IA atende: sem canal conectado, nenhuma mensagem entra nem sai."
          recomendacao="essencial"
          connected={!!whatsapp?.configured}
          connectedLabel="Conectado"
          disconnectedLabel="Não conectado"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate("/settings/channels")}
          data-testid="integrations-goto-channels"
        >
          Abrir Canais
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>

      <div className="via-card space-y-3 p-5">
        <IntegrationHeader
          icon={Mail}
          title="E-mail (Gmail)"
          purpose="Sincroniza suas conversas de e-mail no Inbox e permite responder de dentro do CRM."
          recomendacao="recomendado"
          connected={!!email}
          connectedLabel="Conectado"
          disconnectedLabel="Não conectado"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate("/inbox")}
          data-testid="integrations-goto-inbox"
        >
          {email ? "Abrir Inbox" : "Conectar no Inbox"}
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}