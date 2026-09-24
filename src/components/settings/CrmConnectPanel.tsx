import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Plug, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { formatDateTime } from "@/lib/format";
import { sugerirEtapa } from "@/lib/importacao";
import { useStages } from "@/hooks/useDeals";
import { useOrgApiKey } from "@/hooks/useOrgApiKey";
import {
  CRM_ENTITY_LABEL, CRM_PROVIDERS, CRM_SYNC_ORDER, useConnectCrm, useCrmConnections, useDisconnectCrm, useRefreshCrmStructure, useStartCrmOAuth, useSyncCrm,
  type CrmConnection, type CrmEntity, type CrmProviderInfo, type CrmStructure, type ResultadoSync,
} from "@/hooks/useCrmConnections";

const PRIMEIRA_ETAPA = "__first__";

/**
 * Configurações > Importação > Conectar CRM: liga a conta de outro CRM por
 * token (ou OAuth no Salesforce), mostra a estrutura lida (funis, etapas,
 * contagens), pede o de/para de etapas e sincroniza empresas, contatos e
 * negócios nessa ordem.
 */
export default function CrmConnectPanel() {
  const { data: conexoes, isLoading, error } = useCrmConnections();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const conectado = params.get("crm_connected");
    const erro = params.get("crm_error");
    if (!conectado && !erro) return;
    if (conectado) toast.success("Conta autorizada. A estrutura do CRM foi lida.");
    if (erro) toast.error(`Não foi possível conectar: ${erro}`);
    const proximos = new URLSearchParams(params);
    proximos.delete("crm_connected");
    proximos.delete("crm_error");
    setParams(proximos, { replace: true });
  }, [params, setParams]);

  if (error) return <ErrorState title="Não foi possível carregar as conexões" error={error} />;
  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4" data-testid="crm-connect">
      <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
        Conecte a conta do CRM que você usa hoje. O FlowCRM lê funis, etapas, campos e responsáveis, você confere o de/para e a
        sincronização traz empresas, contatos e negócios sem duplicar o que já existe (ID de origem, e-mail e telefone são as chaves).
      </p>
      {CRM_PROVIDERS.map((p) => {
        const conexao = (conexoes ?? []).find((c) => c.provider === p.id);
        return conexao ? <ConexaoCard key={p.id} info={p} conexao={conexao} /> : <ConectarCard key={p.id} info={p} />;
      })}
    </div>
  );
}

function ConectarCard({ info }: { info: CrmProviderInfo }) {
  const conectar = useConnectCrm();
  const [token, setToken] = useState("");
  const [domain, setDomain] = useState("");
  const [aberto, setAberto] = useState(false);

  const enviar = async () => {
    try {
      await conectar.mutateAsync({ provider: info.id, token, domain: domain || undefined });
      setToken("");
      setDomain("");
      setAberto(false);
      toast.success(`${info.label} conectado. Confira a estrutura e sincronize.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível conectar.");
    }
  };

  return (
    <div className="via-card space-y-3 p-5" data-testid={`crm-provider-${info.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{info.label}</h3>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{info.help}</p>
        </div>
        {!aberto && <Button size="sm" variant="outline" className="gap-1" onClick={() => setAberto(true)} data-testid={`crm-open-${info.id}`}><Plug className="h-4 w-4" strokeWidth={1.5} /> Conectar</Button>}
      </div>
      {aberto && info.auth === "oauth" && <SalesforceOAuth />}
      {aberto && info.auth === "token" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {info.domain && (
            <div className="space-y-1">
              <Label htmlFor={`crm-domain-${info.id}`}>{info.domain.label}</Label>
              <div className="flex items-center gap-1">
                <Input id={`crm-domain-${info.id}`} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="minhaempresa" data-testid={`crm-domain-${info.id}`} />
                <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>{info.domain.suffix}</span>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={`crm-token-${info.id}`}>{info.tokenLabel}</Label>
            <Input id={`crm-token-${info.id}`} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} data-testid={`crm-token-${info.id}`} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" onClick={enviar} disabled={conectar.isPending || !token.trim()} data-testid={`crm-connect-${info.id}`}>{conectar.isPending ? "Lendo a estrutura…" : "Conectar e ler a estrutura"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SalesforceOAuth() {
  const { data: temKey } = useOrgApiKey("salesforce_client_id");
  const { data: temSecret } = useOrgApiKey("salesforce_client_secret");
  const iniciar = useStartCrmOAuth();
  const pronto = !!temKey && !!temSecret;

  const autorizar = async () => {
    try {
      const url = await iniciar.mutateAsync("salesforce");
      window.location.assign(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a autorização.");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
        {pronto ? "Credenciais do app conectado cadastradas em Integrações. Autorize a conta para ler a estrutura." : "Cadastre a Consumer Key e o Consumer Secret do app conectado em Configurações > Integrações."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to="/settings/integrations?integration=salesforce" data-testid="crm-sf-integracoes">{pronto ? "Gerenciar em Integrações" : "Cadastrar em Integrações"}</Link>
        </Button>
        <Button size="sm" onClick={autorizar} disabled={!pronto || iniciar.isPending} data-testid="crm-sf-authorize">Autorizar no Salesforce</Button>
      </div>
    </div>
  );
}

function ConexaoCard({ info, conexao }: { info: CrmProviderInfo; conexao: CrmConnection }) {
  const estrutura = useMemo(() => (conexao.structure ?? { pipelines: [], fields: {}, counts: {}, users: [] }) as unknown as CrmStructure, [conexao.structure]);
  const { data: stages } = useStages();
  const reler = useRefreshCrmStructure();
  const desconectar = useDisconnectCrm();
  const sincronizar = useSyncCrm();
  const etapasOrigem = useMemo(() => estrutura.pipelines.flatMap((p) => p.stages), [estrutura]);
  const [mapa, setMapa] = useState<Record<string, string>>(() => {
    const salvo = (conexao.stage_map ?? {}) as Record<string, string>;
    return { ...salvo };
  });
  const [andamento, setAndamento] = useState<{ kind: CrmEntity; linhas: number } | null>(null);
  const [resultados, setResultados] = useState<ResultadoSync[]>([]);

  useEffect(() => {
    if (!stages?.length) return;
    setMapa((atual) => {
      const proximo = { ...atual };
      for (const e of etapasOrigem) if (!proximo[e.name]) { const s = sugerirEtapa(e.name, stages); if (s) proximo[e.name] = s; }
      return proximo;
    });
  }, [stages, etapasOrigem]);

  const rodar = async (kinds: CrmEntity[]) => {
    setResultados([]);
    try {
      const feitos: ResultadoSync[] = [];
      for (const kind of kinds) {
        setAndamento({ kind, linhas: 0 });
        const r = await sincronizar.mutateAsync({ connectionId: conexao.id, kind, stageMap: mapa, onProgresso: (linhas) => setAndamento({ kind, linhas }) });
        feitos.push(r);
        setResultados([...feitos]);
      }
      toast.success("Sincronização concluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "A sincronização falhou.");
    } finally {
      setAndamento(null);
    }
  };

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  };

  return (
    <div className="via-card space-y-4 p-5" data-testid={`crm-connection-${info.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} style={{ color: conexao.status === "error" ? "var(--via-danger)" : "var(--via-success)" }} />
            {info.label} conectado{conexao.account_domain ? ` · ${conexao.account_domain}` : ""}
          </h3>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            {conexao.last_sync_at ? `Última sincronização ${formatDateTime(conexao.last_sync_at)}` : "Ainda não sincronizado"}
            {conexao.last_error ? ` · ${conexao.last_error}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => acao(() => reler.mutateAsync(conexao.id), "Estrutura atualizada.")} disabled={reler.isPending}><RefreshCw className="h-4 w-4" strokeWidth={1.5} /> Reler estrutura</Button>
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => acao(() => desconectar.mutateAsync(conexao.id), `${info.label} desconectado.`)} disabled={desconectar.isPending} data-testid={`crm-disconnect-${info.id}`}><Unplug className="h-4 w-4" strokeWidth={1.5} /> Desconectar</Button>
        </div>
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-3" style={{ color: "var(--via-text-body)" }}>
        {CRM_SYNC_ORDER.map((k) => (
          <div key={k} className="rounded-md border p-3" style={{ borderColor: "var(--via-border)" }}>
            <p className="font-medium" style={{ color: "var(--via-text-primary)" }}>{CRM_ENTITY_LABEL[k]}</p>
            <p>{typeof estrutura.counts?.[k] === "number" ? `${estrutura.counts[k]} na origem` : "quantidade não informada"}</p>
            <p>{(estrutura.fields?.[k] ?? []).filter((f) => f.custom).length} campos personalizados</p>
          </div>
        ))}
      </div>

      {etapasOrigem.length > 0 && (
        <div className="space-y-2">
          <Label>De/para de etapas ({estrutura.pipelines.length} funil{estrutura.pipelines.length === 1 ? "" : "s"} na origem)</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {etapasOrigem.map((e) => (
              <div key={`${e.pipeline}-${e.id}`} className="flex items-center gap-2">
                <span className="w-44 truncate text-sm" style={{ color: "var(--via-text-primary)" }} title={`${e.pipeline} · ${e.name}`}>{e.name}</span>
                <Select value={mapa[e.name] || PRIMEIRA_ETAPA} onValueChange={(v) => setMapa({ ...mapa, [e.name]: v === PRIMEIRA_ETAPA ? "" : v })}>
                  <SelectTrigger className="h-8 flex-1" aria-label={`Etapa para ${e.name}`} data-testid={`crm-stage-${e.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PRIMEIRA_ETAPA}>Primeira etapa do funil</SelectItem>
                    {(stages ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => rodar(CRM_SYNC_ORDER)} disabled={!!andamento} data-testid={`crm-sync-all-${info.id}`}>Sincronizar tudo</Button>
        {CRM_SYNC_ORDER.map((k) => (
          <Button key={k} size="sm" variant="outline" onClick={() => rodar([k])} disabled={!!andamento} data-testid={`crm-sync-${k}-${info.id}`}>Só {CRM_ENTITY_LABEL[k].toLowerCase()}</Button>
        ))}
        {andamento && <span className="text-xs" style={{ color: "var(--via-text-muted)" }} data-testid="crm-sync-progress">Sincronizando {CRM_ENTITY_LABEL[andamento.kind].toLowerCase()}: {andamento.linhas} registros…</span>}
      </div>

      {resultados.length > 0 && (
        <ul className="space-y-1 text-sm" style={{ color: "var(--via-text-primary)" }} data-testid="crm-sync-result">
          {resultados.map((r) => (
            <li key={r.kind}>{CRM_ENTITY_LABEL[r.kind]}: {r.created} criado{r.created === 1 ? "" : "s"}, {r.updated} atualizado{r.updated === 1 ? "" : "s"}, {r.error} com erro.</li>
          ))}
          <li className="text-xs" style={{ color: "var(--via-text-muted)" }}>O detalhe e o desfazer ficam em Histórico.</li>
        </ul>
      )}
    </div>
  );
}
