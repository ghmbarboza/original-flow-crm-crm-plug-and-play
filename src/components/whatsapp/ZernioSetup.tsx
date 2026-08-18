import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AtSign, Camera, CheckCircle2, Cloud, ExternalLink, Facebook, Loader2, MessageCircle,
  MessageSquare, RefreshCw, Send, Twitter, Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import { Badge } from "@/components/ui/badge";
import {
  useConnectZernioChannel, useSaveZernioConfig, useZernioAccounts, useZernioConfig,
} from "@/hooks/useZernioConfig";

interface Props {
  onConnected: () => void;
  onBack: () => void;
}

/** Canais suportados pelo Zernio, com rótulo e ícone (Lucide, strokeWidth 1.5). */
const CHANNELS: { platform: string; label: string; icon: typeof MessageCircle }[] = [
  { platform: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { platform: "instagram", label: "Instagram DMs", icon: Camera },
  { platform: "facebook", label: "Facebook Messenger", icon: Facebook },
  { platform: "telegram", label: "Telegram", icon: Send },
  { platform: "twitter", label: "Twitter/X DMs", icon: Twitter },
  { platform: "youtube", label: "YouTube", icon: Youtube },
  { platform: "reddit", label: "Reddit DMs", icon: MessageSquare },
  { platform: "bluesky", label: "Bluesky DMs", icon: Cloud },
  { platform: "threads", label: "Threads DMs", icon: AtSign },
];

/**
 * Passo de configuração do Zernio: credenciais (api_key + profile_id) e, em
 * seguida, a conexão de canais via OAuth. Multicanal — o mesmo provedor atende
 * WhatsApp, Instagram, Telegram e outros.
 */
export function ZernioSetup({ onConnected, onBack }: Props) {
  const { data: existing } = useZernioConfig();
  const saveConfig = useSaveZernioConfig();
  const connectChannel = useConnectZernioChannel();

  const [form, setForm] = useState({ api_key: "", profile_id: "" });
  const [sub, setSub] = useState<"config" | "channels">(existing ? "channels" : "config");

  // Contas conectadas (só busca quando já estamos na etapa de canais).
  const { data: accounts, isFetching, refetch } = useZernioAccounts(sub === "channels");
  const connectedByPlatform = useMemo(() => {
    const map = new Map<string, boolean>();
    (accounts ?? []).forEach((a) => { if (a.isActive) map.set(a.platform, true); });
    return map;
  }, [accounts]);

  const handleSave = async () => {
    if (!form.api_key.trim() || !form.profile_id.trim()) {
      toast.error("Informe a API Key e o Profile ID do Zernio.");
      return;
    }
    try {
      await saveConfig.mutateAsync({ api_key: form.api_key.trim(), profile_id: form.profile_id.trim() });
      toast.success("Zernio conectado. Agora ative os canais desejados.");
      setSub("channels");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a configuração.");
    }
  };

  const handleConnectChannel = async (platform: string, label: string) => {
    try {
      const url = await connectChannel.mutateAsync(platform);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.info(`Abrimos a autorização do ${label} em outra aba. Conclua e volte aqui.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Não foi possível conectar o ${label}.`);
    }
  };

  if (sub === "config") {
    return (
      <div className="space-y-6">
        <ApiKeyTutorialDialog service="zernio" />
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="zernio_api_key">API Key do Zernio</Label>
            <Input
              id="zernio_api_key"
              type="password"
              placeholder="zk_live_…"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zernio_profile_id">Profile ID</Label>
            <Input
              id="zernio_profile_id"
              placeholder="ID do perfil no Zernio"
              value={form.profile_id}
              onChange={(e) => setForm({ ...form, profile_id: e.target.value })}
            />
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Encontre a API Key e o Profile ID no painel do Zernio (Dashboard › API Keys / Profiles).
            </p>
          </div>
        </div>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} disabled={saveConfig.isPending}>Voltar</Button>
          <Button onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />}
            Verificar e conectar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Selecione os canais que deseja ativar
          </p>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Conecte cada canal pelo login seguro do Zernio. Você pode adicionar outros depois em Configurações › Integrações › Canais de atendimento.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} strokeWidth={1.5} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {CHANNELS.map(({ platform, label, icon: Icon }) => {
          const connected = connectedByPlatform.get(platform);
          return (
            <div key={platform} className="via-card flex items-center justify-between gap-3 p-3">
              <span className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-primary)" }}>
                <Icon className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                {label}
              </span>
              {connected ? (
                <Badge className="gap-1 bg-success text-success-foreground">
                  <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> Conectado
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => handleConnectChannel(platform, label)}
                  disabled={connectChannel.isPending}
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Conectar
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setSub("config")}>Voltar</Button>
        <Button onClick={onConnected}>Continuar</Button>
      </div>
    </div>
  );
}
