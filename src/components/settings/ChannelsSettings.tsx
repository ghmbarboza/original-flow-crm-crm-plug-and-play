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
import {
  useChannelDistribution, useDeleteChannelDistribution, useSaveChannelDistribution,
} from "@/hooks/useAgentLoad";

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
                data-testid="distribution-mode"
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

      <Button onClick={handleSave} disabled={save.isPending} data-testid="distribution-save">
        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />}
        Salvar distribuição
      </Button>

      <PerChannelDistribution />
    </div>
  );
}

/**
 * Sobrescrita por canal. Sem linha para um canal, vale a configuração global
 * acima — é assim que pick_agent_for_channel resolve no banco.
 */
function PerChannelDistribution() {
  const { data: configs, isLoading } = useChannelDistribution();
  const save = useSaveChannelDistribution();
  const remove = useDeleteChannelDistribution();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    channel: ZERNIO_CHANNELS[0],
    distribution_mode: "open_queue" as DistributionMode,
    offline_timeout_minutes: 30,
    max: "",
  });

  const configured = new Set((configs ?? []).map((c) => c.channel));
  const remaining = ZERNIO_CHANNELS.filter((ch) => !configured.has(ch));

  const persist = async (
    channel: string,
    patch: Partial<{ distribution_mode: DistributionMode; offline_timeout_minutes: number; max_conversations_per_agent: number | null }>,
    current?: { distribution_mode: DistributionMode; offline_timeout_minutes: number; max_conversations_per_agent: number | null },
  ) => {
    try {
      await save.mutateAsync({
        channel,
        distribution_mode: patch.distribution_mode ?? current?.distribution_mode ?? "open_queue",
        offline_timeout_minutes: patch.offline_timeout_minutes ?? current?.offline_timeout_minutes ?? 30,
        max_conversations_per_agent:
          patch.max_conversations_per_agent !== undefined
            ? patch.max_conversations_per_agent
            : current?.max_conversations_per_agent ?? null,
      });
      toast.success("Distribuição do canal atualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--via-border)" }}>
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Sobrescrita por canal
        </p>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Cada canal pode ter seu próprio modo e teto de conversas por agente. Canal sem
          linha aqui segue a configuração global acima. Ao bater o teto, o agente sai do
          rodízio e a conversa vai para a fila em vez de estourar o limite dele.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="via-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--via-border)" }}>
                <th className="p-2 text-left font-medium">Canal</th>
                <th className="p-2 text-left font-medium">Modo</th>
                <th className="p-2 text-left font-medium">Timeout (min)</th>
                <th className="p-2 text-left font-medium">Máx/agente</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(configs ?? []).length === 0 && !adding && (
                <tr>
                  <td colSpan={5} className="p-4 text-center" style={{ color: "var(--via-text-muted)" }}>
                    Nenhuma sobrescrita. Todos os canais usam a configuração global.
                  </td>
                </tr>
              )}
              {(configs ?? []).map((c) => (
                <tr key={c.id} className="border-b" style={{ borderColor: "var(--via-border)" }}>
                  <td className="p-2">{channelMeta(c.channel).label}</td>
                  <td className="p-2">
                    <select
                      className="rounded-md border px-2 py-1 text-sm"
                      style={{ borderColor: "var(--via-border)", background: "transparent" }}
                      value={c.distribution_mode}
                      onChange={(e) => persist(c.channel, { distribution_mode: e.target.value as DistributionMode }, c)}
                    >
                      {DISTRIBUTION.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={1}
                      className="h-8 w-24"
                      defaultValue={c.offline_timeout_minutes}
                      onBlur={(e) => {
                        const v = Math.max(1, Number(e.target.value) || 1);
                        if (v !== c.offline_timeout_minutes) persist(c.channel, { offline_timeout_minutes: v }, c);
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="sem limite"
                      className="h-8 w-28"
                      defaultValue={c.max_conversations_per_agent ?? ""}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const v = raw === "" ? null : Math.max(1, Number(raw) || 1);
                        if (v !== c.max_conversations_per_agent) {
                          persist(c.channel, { max_conversations_per_agent: v }, c);
                        }
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove.mutate(c.channel)}
                      aria-label={`Remover sobrescrita de ${channelMeta(c.channel).label}`}
                      title="Voltar a usar a configuração global"
                    >
                      <RotateCw className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="via-card flex flex-wrap items-end gap-2 p-3">
          <div className="space-y-1">
            <Label className="text-xs">Canal</Label>
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--via-border)", background: "transparent" }}
              value={draft.channel}
              onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
            >
              {remaining.map((ch) => (
                <option key={ch} value={ch}>{channelMeta(ch).label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Modo</Label>
            <select
              className="rounded-md border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--via-border)", background: "transparent" }}
              value={draft.distribution_mode}
              onChange={(e) => setDraft({ ...draft, distribution_mode: e.target.value as DistributionMode })}
            >
              {DISTRIBUTION.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Máx/agente</Label>
            <Input
              type="number"
              min={1}
              placeholder="sem limite"
              className="h-9 w-28"
              value={draft.max}
              onChange={(e) => setDraft({ ...draft, max: e.target.value })}
            />
          </div>
          <Button
            onClick={async () => {
              await persist(draft.channel, {
                distribution_mode: draft.distribution_mode,
                offline_timeout_minutes: draft.offline_timeout_minutes,
                max_conversations_per_agent: draft.max.trim() === "" ? null : Number(draft.max),
              });
              setAdding(false);
              setDraft({ ...draft, max: "" });
            }}
            disabled={save.isPending}
          >
            Adicionar
          </Button>
          <Button variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
        </div>
      ) : (
        remaining.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { setDraft({ ...draft, channel: remaining[0] }); setAdding(true); }}>
            Adicionar canal
          </Button>
        )
      )}
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
