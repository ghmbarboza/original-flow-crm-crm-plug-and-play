import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useConnectEvolution, useEvolutionStatus,
} from "@/hooks/useWhatsAppConfig";

interface Props {
  onConnected: () => void;
  onBack: () => void;
}

/**
 * Passo 2a do wizard: credenciais Evolution + teste de conexão + QR Code.
 *
 * Depois de conectar, mostra o QR e faz poll do status da instância até o número
 * parear (o webhook da Evolution atualiza `status` para "connected").
 */
export function EvolutionSetup({ onConnected, onBack }: Props) {
  const connect = useConnectEvolution();
  const [form, setForm] = useState({
    server_url: "",
    api_key: "",
    instance_name: "",
    display_name: "",
  });
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const { data: status } = useEvolutionStatus(instanceId, !!instanceId);
  const connected = status?.status === "connected";

  const handleConnect = async () => {
    if (!form.server_url.trim() || !form.api_key.trim() || !form.instance_name.trim()) {
      toast.error("Preencha servidor, API key e nome da instância.");
      return;
    }
    try {
      const result = await connect.mutateAsync({
        server_url: form.server_url.trim().replace(/\/$/, ""),
        api_key: form.api_key.trim(),
        instance_name: form.instance_name.trim(),
        display_name: form.display_name.trim() || form.instance_name.trim(),
      });
      setInstanceId(result.instance_id);
      setQrCode(result.qr_code);
      if (result.status === "connected") {
        toast.success("Instância já conectada.");
      } else {
        toast.success("Instância criada. Escaneie o QR Code no WhatsApp.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível conectar à Evolution.",
      );
    }
  };

  // QR pareado: o poll detectou conexão.
  const showQr = qrCode && !connected;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="server_url">URL do servidor Evolution</Label>
          <Input
            id="server_url"
            placeholder="https://evolution.suaempresa.com"
            value={form.server_url}
            onChange={(e) => setForm({ ...form, server_url: e.target.value })}
            disabled={!!instanceId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="api_key">API Key</Label>
          <Input
            id="api_key"
            type="password"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            disabled={!!instanceId}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instance_name">Nome da instância</Label>
          <Input
            id="instance_name"
            placeholder="atendimento-principal"
            value={form.instance_name}
            onChange={(e) => setForm({ ...form, instance_name: e.target.value })}
            disabled={!!instanceId}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="display_name">Nome de exibição (opcional)</Label>
          <Input
            id="display_name"
            placeholder="Atendimento Viver de IA"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            disabled={!!instanceId}
          />
        </div>
      </div>

      {showQr && (
        <div className="via-card flex flex-col items-center gap-3 p-6 text-center">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            <QrCode className="h-4 w-4" strokeWidth={1.5} />
            Escaneie no WhatsApp
          </div>
          {/* A Evolution devolve o QR como data URL ou base64. */}
          <img
            src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
            alt="QR Code para parear o WhatsApp"
            className="h-56 w-56 rounded-lg bg-white p-2"
          />
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--via-text-muted)" }}>
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
            Aguardando pareamento… Abra o WhatsApp › Aparelhos conectados › Conectar aparelho.
          </p>
        </div>
      )}

      {connected && (
        <div className="via-card flex items-center gap-3 p-4">
          <CheckCircle2 className="h-6 w-6 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-success)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              WhatsApp conectado
            </p>
            {status?.phone_number && (
              <p className="flex items-center gap-1.5 text-sm" style={{ color: "var(--via-text-muted)" }}>
                <Smartphone className="h-3.5 w-3.5" strokeWidth={1.5} />
                {status.phone_number}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={connect.isPending}>
          Voltar
        </Button>
        {connected ? (
          <Button onClick={onConnected}>Continuar</Button>
        ) : (
          <Button onClick={handleConnect} disabled={connect.isPending || !!instanceId}>
            {connect.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                Conectando…
              </>
            ) : instanceId ? (
              "Aguardando QR…"
            ) : (
              "Testar conexão"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
