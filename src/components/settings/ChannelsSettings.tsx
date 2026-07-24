import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2, ExternalLink, Loader2, RefreshCw, RotateCw,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { ProviderWizard } from "@/components/whatsapp/ProviderWizard";
import { channelMeta } from "@/components/whatsapp/ChannelBadge";
import {
  useSetDistribution, useWhatsAppSetup, type DistributionMode, type WhatsAppProvider,
} from "@/hooks/useWhatsAppConfig";
import { useConnectZernioChannel, useZernioAccounts } from "@/hooks/useZernioConfig";

const PROVIDER_LABEL: Record<WhatsAppProvider, string> = {
  evolution: "Evolution API",
  meta_official: "API Oficial (Meta)",
  zernio: "Zernio (multicanal)",
};

// Canais que o Zernio pode conectar (ordem de exibição).
const ZERNIO_CHANNELS = [
  "whatsapp", "instagram", "facebook", "telegram", "twitter", "youtube", "reddit", "bluesky", "threads",
];

const DISTRIBUTION: { value: DistributionMode; label: string; hint: string }[] = [
  { value: "open_queue", label: "Fila aberta", hint: "Qualquer agente disponível pode assumir a conversa." },
  { value: "round_robin", label: "Round-robin", hint: "Distribui as conversas em rodízio entre os agentes." },
  { value: "ai_directed", label: "IA direciona", hint: "A IA escolhe o melhor agente para cada conversa." },
];

/** Sub-aba: provedor ativo + troca de provedor. */
function ProviderTab() {
  const { data: setup, isLoading, refetch } = useWhatsAppSetup();
  const [changing, setChanging] = useState(false);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (!setup?.configured || changing) {
    return (
      <div className="space-y-4">
        {changing && (
          <Button variant="ghost" size="sm" onClick={() => setChanging(false)}>← Cancelar troca</Button>
        )}
        <ProviderWizard onDone={() => { setChanging(false); refetch(); }} />
      </div>
    );
  }

  const provider = setup.provider!;
  const detail =
    provider === "evolution" ? setup.evolution?.phone_number ?? setup.evolution?.instance_name
    : provider === "meta_official" ? setup.meta?.phone_number
    : setup.zernio?.profile_id ? `Profile ${setup.zernio.profile_id}` : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">Provedor ativo</CardTitle>
            <CardDescription className="text-sm">
              Provedor de mensagens que atende esta organização.
            </CardDescription>
          </div>
          <Badge className="gap-1 bg-success text-success-foreground">
            <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> Conectado
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-lg font-medium" style={{ color: "var(--via-text-primary)" }}>
            {PROVIDER_LABEL[provider]}
          </p>
          {detail && <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>{detail}</p>}
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => setChanging(true)}>
          <RotateCw className="h-4 w-4" strokeWidth={1.5} />
          Trocar provedor
        </Button>
      </CardContent>
    </Card>
  );
}

/** Sub-aba: canais conectados no Zernio (adicionar/status). */
function ChannelsTab() {
  const { data: setup } = useWhatsAppSetup();
  const isZernio = setup?.provider === "zernio";
  const { data: accounts, isFetching, refetch } = useZernioAccounts(!!isZernio);
  const connectChannel = useConnectZernioChannel();

  if (!isZernio) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          A gestão de múltiplos canais está disponível apenas com o provedor <strong>Zernio</strong>.
          Troque o provedor na aba “Provedor ativo” para conectar Instagram, Telegram e outros.
        </AlertDescription>
      </Alert>
    );
  }

  const connected = new Set((accounts ?? []).filter((a) => a.isActive).map((a) => a.platform));

  const connect = async (platform: string, label: string) => {
    try {
      const url = await connectChannel.mutateAsync(platform);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.info(`Abrimos a autorização do ${label} em outra aba. Conclua e clique em Atualizar.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Não foi possível conectar o ${label}.`);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Conecte canais adicionais por OAuth. Cada canal aparece no mesmo inbox.
        </p>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} strokeWidth={1.5} />
          Atualizar
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {ZERNIO_CHANNELS.map((platform) => {
          const { label, Icon } = channelMeta(platform);
          const isOn = connected.has(platform);
          return (
            <div key={platform} className="via-card flex items-center justify-between gap-3 p-3">
              <span className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-primary)" }}>
                <Icon className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                {label}
              </span>
              {isOn ? (
                <Badge className="gap-1 bg-success text-success-foreground">
                  <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> Conectado
                </Badge>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => connect(platform, label)} disabled={connectChannel.isPending}>
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Conectar
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Sub-aba: distribuição de conversas. */
function DistributionTab() {
  const { data: setup, isLoading } = useWhatsAppSetup();
  const save = useSetDistribution();
  const [mode, setMode] = useState<DistributionMode>("open_queue");
  const [timeout, setTimeoutMin] = useState(5);

  useEffect(() => {
    if (setup?.config) {
      setMode((setup.config.distribution_mode as DistributionMode) ?? "open_queue");
      setTimeoutMin(setup.config.offline_timeout_minutes ?? 5);
    }
  }, [setup?.config]);

  if (isLoading) return <Skeleton className="h-56 w-full" />;

  const handleSave = async () => {
    try {
      await save.mutateAsync({ distribution_mode: mode, offline_timeout_minutes: timeout });
      toast.success("Distribuição atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Modo de distribuição</p>
        <div className="grid gap-2">
          {DISTRIBUTION.map((d) => {
            const active = mode === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => setMode(d.value)}
                className="via-card flex items-start gap-3 p-3 text-left transition-colors"
                style={active ? { borderColor: "var(--via-navy)", boxShadow: "0 0 0 1px var(--via-navy)" } : undefined}
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  style={{ borderColor: active ? "var(--via-navy)" : "var(--via-border)" }}
                >
                  {active && <span className="h-2 w-2 rounded-full" style={{ background: "var(--via-navy)" }} />}
                </span>
                <span>
                  <span className="block text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{d.label}</span>
                  <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>{d.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 sm:max-w-xs">
        <Label htmlFor="offline_timeout">Redistribuir após agente offline (minutos)</Label>
        <Input
          id="offline_timeout"
          type="number"
          min={1}
          max={120}
          value={timeout}
          onChange={(e) => setTimeoutMin(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>

      <Button onClick={handleSave} disabled={save.isPending}>
        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />}
        Salvar distribuição
      </Button>
    </div>
  );
}

/** Sub-aba: comportamento por provedor. */
function BehaviorTab() {
  const { data: setup } = useWhatsAppSetup();
  return (
    <div className="space-y-3">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          A personalidade, a base de conhecimento e as regras de handoff da IA ficam em{" "}
          <strong>Configurações › IA</strong>. Elas valem para todos os canais.
        </AlertDescription>
      </Alert>
      {setup?.provider === "zernio" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Comportamento por canal (Zernio)</CardTitle>
            <CardDescription className="text-sm">
              Ajustes por canal (responder em grupos, leitura automática) chegam junto com a expansão do Zernio.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Configurações específicas do provedor {setup?.provider ? PROVIDER_LABEL[setup.provider] : ""} são
          gerenciadas na conexão (aba “Provedor ativo”).
        </p>
      )}
    </div>
  );
}

export default function ChannelsSettings() {
  const [tab, setTab] = useState("provider");
  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="provider">Provedor ativo</TabsTrigger>
        <TabsTrigger value="channels">Canais ativos</TabsTrigger>
        <TabsTrigger value="distribution">Distribuição</TabsTrigger>
        <TabsTrigger value="behavior">Comportamento</TabsTrigger>
      </TabsList>
      <TabsContent value="provider"><ProviderTab /></TabsContent>
      <TabsContent value="channels"><ChannelsTab /></TabsContent>
      <TabsContent value="distribution"><DistributionTab /></TabsContent>
      <TabsContent value="behavior"><BehaviorTab /></TabsContent>
    </Tabs>
  );
}
