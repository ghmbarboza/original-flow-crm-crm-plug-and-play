import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Plug, RefreshCw, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useOrgId } from "@/hooks/useOrgId";
import {
  ERP_CANONICAL_FIELDS, ERP_INBOUND_EVENTS, ERP_OUTBOUND_EVENTS,
  useErpConfig, useErpLogs, useRegenerateErpToken, useSaveErpConfig, useTestErpConnection,
} from "@/hooks/useErpIntegration";
import { formatDateTime } from "@/lib/format";
import { IntegrationHeader } from "@/components/settings/IntegrationHeader";

const AUTH_TYPES = [
  { value: "none", label: "Nenhuma" },
  { value: "bearer", label: "Bearer Token" },
  { value: "basic", label: "Basic Auth" },
  { value: "api_key", label: "API Key (header)" },
] as const;

type Mappings = Record<string, Record<string, string>>;

/**
 * Configurações > Integrações > ERP (Parte 2 do Sprint 10B).
 *
 * Saída: URL + auth + eventos + mapeamento de campos por evento — os triggers
 * de banco enfileiram e a erp-outbound entrega a cada minuto. Entrada: URL da
 * erp-webhook + token por org + ações habilitáveis, com exemplo de payload
 * para o desenvolvedor do ERP. Logs dos dois sentidos no rodapé.
 */
export default function ErpSettings() {
  const orgId = useOrgId();
  const { data: config, isLoading } = useErpConfig();
  const { data: logs } = useErpLogs();
  const salvar = useSaveErpConfig();
  const regenerar = useRegenerateErpToken();
  const testar = useTestErpConnection();

  const [isActive, setIsActive] = useState(false);
  const [url, setUrl] = useState("");
  const [authType, setAuthType] = useState<string>("none");
  const [authConfig, setAuthConfig] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<Set<string>>(new Set());
  const [mappings, setMappings] = useState<Mappings>({});
  const [mappingEvent, setMappingEvent] = useState<string>(ERP_OUTBOUND_EVENTS[0].value);
  const [handlers, setHandlers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!config) return;
    setIsActive(config.is_active);
    setUrl(config.outbound_url ?? "");
    setAuthType(config.outbound_auth_type ?? "none");
    setAuthConfig((config.outbound_auth_config as Record<string, string>) ?? {});
    setEvents(new Set(config.outbound_events ?? []));
    setMappings((config.outbound_field_mappings as Mappings) ?? {});
    setHandlers((config.inbound_event_handlers as Record<string, boolean>) ?? {});
  }, [config]);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-webhook`;

  const submeter = async () => {
    try {
      await salvar.mutateAsync({
        is_active: isActive,
        outbound_url: url.trim() || null,
        outbound_auth_type: authType,
        outbound_auth_config: authConfig,
        outbound_events: [...events],
        outbound_field_mappings: mappings,
        inbound_event_handlers: handlers,
      });
      toast.success("Integração ERP salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const testarConexao = async () => {
    if (!config?.outbound_url && !url.trim()) {
      toast.error("Informe e salve a URL de destino antes de testar.");
      return;
    }
    try {
      await testar.mutateAsync();
      toast.success("O destino aceitou o payload de teste. 🎉");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "O teste falhou.");
    }
  };

  const copiar = async (texto: string, rotulo: string) => {
    // Clipboard pode ser negado (permissão, iframe, navegador antigo) — sem o
    // catch isso vira exceção não tratada e o botão "não faz nada".
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie à mão.");
    }
  };

  const linhasDoMapa = Object.entries(mappings[mappingEvent] ?? {});

  const setMapa = (canonical: string, erpField: string) => {
    setMappings((m) => {
      const doEvento = { ...(m[mappingEvent] ?? {}) };
      if (erpField) doEvento[canonical] = erpField;
      else delete doEvento[canonical];
      return { ...m, [mappingEvent]: doEvento };
    });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!orgId) return null;

  return (
    <div className="via-card space-y-5 p-5">
      <IntegrationHeader
        icon={Plug}
        title="Conectividade ERP"
        purpose="Mantém contatos, negócios e pedidos em sincronia com seu sistema de gestão (Omie, Bling, Totvs, SAP…) via webhooks, nos dois sentidos."
        recomendacao="opcional"
        connected={isActive}
        connectedLabel="Ativo"
        disconnectedLabel="Desativado"
        action={
          <Switch
          aria-label="Ativar a integração ERP"
          checked={isActive}
          onCheckedChange={setIsActive}
          data-testid="erp-ativo"
        />
      </div>

      <Separator />

      {/* ENVIAR (FlowCRM → ERP) */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold" style={{ color: "var(--via-text-primary)" }}>
          Enviar dados (FlowCRM → ERP)
        </h4>
        <div className="space-y-2">
          <Label htmlFor="erp-url">URL de destino</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="erp-url"
              className="min-w-64 flex-1"
              placeholder="https://seu-erp.com/webhook/flowcrm"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              data-testid="erp-url"
            />
            <Button variant="outline" className="gap-1.5" onClick={testarConexao} disabled={testar.isPending}>
              <Send className="h-4 w-4" strokeWidth={1.5} />
              {testar.isPending ? "Testando…" : "Testar"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="erp-auth">Autenticação</Label>
            <Select value={authType} onValueChange={setAuthType}>
              <SelectTrigger id="erp-auth"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUTH_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {authType === "bearer" && (
            <div className="space-y-2">
              <Label htmlFor="erp-token-out">Token</Label>
              <Input
                id="erp-token-out"
                type="password"
                value={authConfig.token ?? ""}
                onChange={(e) => setAuthConfig({ ...authConfig, token: e.target.value })}
              />
            </div>
          )}
          {authType === "basic" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="erp-user">Usuário</Label>
                <Input id="erp-user" value={authConfig.username ?? ""} onChange={(e) => setAuthConfig({ ...authConfig, username: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="erp-pass">Senha</Label>
                <Input id="erp-pass" type="password" value={authConfig.password ?? ""} onChange={(e) => setAuthConfig({ ...authConfig, password: e.target.value })} />
              </div>
            </>
          )}
          {authType === "api_key" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="erp-header">Nome do header</Label>
                <Input id="erp-header" placeholder="X-Api-Key" value={authConfig.header ?? ""} onChange={(e) => setAuthConfig({ ...authConfig, header: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="erp-key">Chave</Label>
                <Input id="erp-key" type="password" value={authConfig.token ?? ""} onChange={(e) => setAuthConfig({ ...authConfig, token: e.target.value })} />
              </div>
            </>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Eventos a enviar
          </legend>
          {ERP_OUTBOUND_EVENTS.map((ev) => (
            <label key={ev.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
              <Checkbox
                checked={events.has(ev.value)}
                onCheckedChange={(v) => {
                  setEvents((prev) => {
                    const next = new Set(prev);
                    if (v === true) next.add(ev.value);
                    else next.delete(ev.value);
                    return next;
                  });
                }}
                data-testid={`erp-event-${ev.value}`}
              />
              {ev.label}
            </label>
          ))}
        </fieldset>

        {/* Mapeamento de campos por evento */}
        <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--via-border)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Mapeamento de campos
            </span>
            <Select value={mappingEvent} onValueChange={setMappingEvent}>
              <SelectTrigger className="w-64" aria-label="Evento a mapear"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ERP_OUTBOUND_EVENTS.map((ev) => <SelectItem key={ev.value} value={ev.value}>{ev.value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Sem mapeamento, o evento sai com os campos originais (deal.title, contact.email…).
            Preencha o nome do campo do ERP para renomear; somente os campos mapeados são enviados.
          </p>
          <div className="space-y-1.5">
            {(ERP_CANONICAL_FIELDS[mappingEvent] ?? []).map((canonical) => (
              <div key={canonical} className="flex items-center gap-2">
                <code className="w-44 shrink-0 text-xs" style={{ color: "var(--via-text-body)" }}>{canonical}</code>
                <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>→</span>
                <Input
                  className="h-8 max-w-56"
                  placeholder="campo_no_erp"
                  value={mappings[mappingEvent]?.[canonical] ?? ""}
                  onChange={(e) => setMapa(canonical, e.target.value.trim())}
                  aria-label={`Campo do ERP para ${canonical}`}
                />
              </div>
            ))}
          </div>
          {linhasDoMapa.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => setMappings((m) => ({ ...m, [mappingEvent]: {} }))}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              Limpar mapeamento deste evento
            </Button>
          )}
        </div>
      </section>

      <Separator />

      {/* RECEBER (ERP → FlowCRM) */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold" style={{ color: "var(--via-text-primary)" }}>
          Receber dados (ERP → FlowCRM)
        </h4>
        <div className="space-y-2">
          <Label htmlFor="erp-inbound-url">URL do seu webhook no FlowCRM</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="erp-inbound-url" readOnly className="min-w-64 flex-1 text-xs" value={webhookUrl} />
            <Button variant="outline" className="gap-1.5" onClick={() => copiar(webhookUrl, "URL")}>
              <Copy className="h-4 w-4" strokeWidth={1.5} />
              Copiar
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="erp-inbound-token">Token de autenticação (header x-erp-token)</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="erp-inbound-token" readOnly className="min-w-64 flex-1 font-mono text-xs" value={config?.inbound_token ?? "salve a configuração para gerar"} />
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={!config || regenerar.isPending}
              onClick={async () => {
                try {
                  await regenerar.mutateAsync();
                  toast.success("Novo token gerado. Atualize o ERP — o anterior parou de valer.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Não foi possível regenerar.");
                }
              }}
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              Regenerar
            </Button>
            {config?.inbound_token && (
              <Button variant="ghost" className="gap-1.5" onClick={() => copiar(config.inbound_token, "Token")}>
                <Copy className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            O que o FlowCRM faz ao receber cada evento
          </p>
          {ERP_INBOUND_EVENTS.map((ev) => (
            <div key={ev.value} className="rounded-lg border p-3" style={{ borderColor: "var(--via-border)" }}>
              <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
                <Switch
                  aria-label={`Habilitar o evento ${ev.value}`}
                  checked={handlers[ev.value] !== false}
                  onCheckedChange={(v) => setHandlers({ ...handlers, [ev.value]: v })}
                  data-testid={`erp-handler-${ev.value}`}
                />
                <code className="text-xs">{ev.label}</code>
              </label>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Exemplo de payload
                </summary>
                <pre className="mt-1 overflow-x-auto rounded p-2 text-xs" style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}>
                  {ev.example}
                </pre>
              </details>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={submeter} disabled={salvar.isPending} data-testid="erp-salvar">
          {salvar.isPending ? "Salvando…" : "Salvar integração ERP"}
        </Button>
      </div>

      {/* Logs */}
      {(logs ?? []).length > 0 && (
        <>
          <Separator />
          <section className="space-y-2">
            <h4 className="text-sm font-semibold" style={{ color: "var(--via-text-primary)" }}>
              Últimos webhooks
            </h4>
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Direção</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logs ?? []).map((log) => (
                    <TableRow key={log.id} data-testid="erp-log-row">
                      <TableCell className="text-xs">{log.direction === "outbound" ? "Saída" : "Entrada"}</TableCell>
                      <TableCell className="font-mono text-xs">{log.event_type}</TableCell>
                      <TableCell>
                        <Badge variant={log.status === "success" ? "secondary" : log.status === "pending" ? "outline" : "destructive"} className="text-xs">
                          {log.status === "success" ? "ok" : log.status === "pending" ? "pendente" : "falhou"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-xs" title={log.error_msg ?? undefined}>
                        {log.error_msg ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{formatDateTime(log.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
