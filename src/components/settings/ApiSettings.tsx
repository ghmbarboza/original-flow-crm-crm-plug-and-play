import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { formatDateTime } from "@/lib/format";
import { API_SCOPES, apiBaseUrl, useApiKeys, useApiRequestLogs, useCreateApiKey, useRevokeApiKey, type ApiKey } from "@/hooks/useApiKeys";

/**
 * Configurações > API: chaves com escopos para outras ferramentas e soluções
 * operarem o CRM, logs das chamadas e a documentação (OpenAPI).
 */
export default function ApiSettings() {
  const { data: chaves, isLoading, error } = useApiKeys();
  const { data: logs } = useApiRequestLogs(50);
  const revogar = useRevokeApiKey();
  const [aberto, setAberto] = useState(false);
  const base = apiBaseUrl();

  const copiar = async (texto: string, aviso = "Copiado.") => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(aviso);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const revogarChave = async (k: ApiKey) => {
    try {
      await revogar.mutateAsync(k.id);
      toast.success(`Chave "${k.name}" revogada.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível revogar.");
    }
  };

  if (error) return <ErrorState title="Não foi possível carregar as chaves" error={error} />;
  const ativas = (chaves ?? []).filter((k) => !k.revoked_at);
  const revogadas = (chaves ?? []).filter((k) => k.revoked_at);

  return (
    <div className="space-y-6" data-testid="api-settings">
      <div className="via-card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Chaves de acesso</h2>
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Cada ferramenta recebe a própria chave, só com os escopos de que precisa. A chave aparece uma vez, na criação.
            </p>
          </div>
          <Button onClick={() => setAberto(true)} className="gap-1.5" data-testid="api-key-new">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova chave
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : ativas.length === 0 ? (
          <EmptyState icon={KeyRound} title="Nenhuma chave ativa" description="Crie uma chave para conectar uma solução do Viver de IA, o n8n, o Make ou o seu sistema." />
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--via-border)" }}>
            {ativas.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`api-key-${k.key_prefix}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium" style={{ color: "var(--via-text-primary)" }}>
                    {k.name} <span className="font-mono text-xs" style={{ color: "var(--via-text-muted)" }}>{k.key_prefix}…</span>
                  </p>
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                    {(k.scopes ?? []).join(", ")} · {k.rate_limit_per_minute}/min · último uso {k.last_used_at ? formatDateTime(k.last_used_at) : "nunca"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => revogarChave(k)} disabled={revogar.isPending}>Revogar</Button>
              </li>
            ))}
          </ul>
        )}
        {revogadas.length > 0 && (
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{revogadas.length} chave{revogadas.length > 1 ? "s" : ""} revogada{revogadas.length > 1 ? "s" : ""}.</p>
        )}
      </div>

      <div className="via-card space-y-3 p-5">
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Como usar</h2>
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          Endereço base <span className="font-mono text-xs">{base}</span>
          <Button size="sm" variant="ghost" className="ml-1" onClick={() => copiar(base, "Endereço copiado.")} aria-label="Copiar endereço base">
            <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Button>
        </p>
        <pre className="overflow-x-auto rounded-md p-3 text-xs" style={{ background: "var(--via-surface)" }}>{`curl ${base}/pipelines \\
  -H "Authorization: Bearer fcrm_live_SUA_CHAVE"

curl -X POST ${base}/deals \\
  -H "Authorization: Bearer fcrm_live_SUA_CHAVE" -H "Content-Type: application/json" \\
  -d '{"email":"lead@empresa.com","title":"Proposta","value":4900,"stage":"Proposta"}'`}</pre>
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          Documentação completa (OpenAPI): <a className="underline" href={`${base}/openapi.json`} target="_blank" rel="noopener noreferrer">{base}/openapi.json</a>.
          Eventos de saída (webhooks) ficam em Integrações.
        </p>
      </div>

      <div className="via-card space-y-3 p-5" data-testid="api-logs">
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Últimas chamadas</h2>
        {(logs ?? []).length === 0 ? (
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhuma chamada ainda.</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto text-xs" style={{ borderColor: "var(--via-border)" }}>
            {(logs ?? []).map((l) => (
              <li key={l.id} className="flex flex-wrap gap-3 py-1.5 font-mono">
                <span style={{ color: "var(--via-text-muted)" }}>{formatDateTime(l.created_at)}</span>
                <span style={{ color: l.status >= 400 ? "var(--via-coral, #e0553f)" : "var(--via-text-primary)" }}>{l.status}</span>
                <span>{l.method} {l.path}</span>
                {l.duration_ms !== null && <span style={{ color: "var(--via-text-muted)" }}>{l.duration_ms} ms</span>}
                {l.error && <span style={{ color: "var(--via-text-muted)" }}>{l.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <NovaChaveDialog open={aberto} onOpenChange={setAberto} />
    </div>
  );
}

function NovaChaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const criar = useCreateApiKey();
  const [nome, setNome] = useState("");
  const [escopos, setEscopos] = useState<string[]>(["contacts:read", "deals:read", "pipelines:read"]);
  const [limite, setLimite] = useState(120);
  const [chave, setChave] = useState<string | null>(null);

  const fechar = (o: boolean) => {
    if (!o) {
      setNome("");
      setEscopos(["contacts:read", "deals:read", "pipelines:read"]);
      setLimite(120);
      setChave(null);
    }
    onOpenChange(o);
  };

  const gerar = async () => {
    try {
      const r = await criar.mutateAsync({ name: nome, scopes: escopos, rateLimit: limite });
      setChave(r.key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a chave.");
    }
  };

  const copiar = async () => {
    if (!chave) return;
    try {
      await navigator.clipboard.writeText(chave);
      toast.success("Chave copiada. Guarde em lugar seguro: ela não aparece de novo.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{chave ? "Chave criada" : "Nova chave de API"}</DialogTitle>
          <DialogDescription>
            {chave ? "Copie agora. Por segurança, o CRM guarda só uma impressão da chave." : "Dê um nome (a ferramenta que vai usar) e escolha o que ela pode fazer."}
          </DialogDescription>
        </DialogHeader>
        {chave ? (
          <div className="space-y-3">
            <pre className="overflow-x-auto rounded-md p-3 text-xs" style={{ background: "var(--via-surface)" }} data-testid="api-key-value">{chave}</pre>
            <Button onClick={copiar} className="gap-1.5"><Copy className="h-4 w-4" strokeWidth={1.5} />Copiar chave</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Nome</Label>
              <Input id="api-key-name" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nina Zernio, n8n, site..." data-testid="api-key-name" />
            </div>
            <div className="space-y-2">
              <Label>Escopos</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {API_SCOPES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
                    <Checkbox
                      checked={escopos.includes(s.value)}
                      onCheckedChange={(v) => setEscopos(v ? [...escopos, s.value] : escopos.filter((x) => x !== s.value))}
                      aria-label={s.label}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-limit">Chamadas por minuto</Label>
              <Input id="api-key-limit" type="number" className="w-32" value={limite} min={10} max={3000} onChange={(e) => setLimite(Number(e.target.value) || 120)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)}>{chave ? "Fechar" : "Cancelar"}</Button>
          {!chave && (
            <Button onClick={gerar} disabled={!nome.trim() || escopos.length === 0 || criar.isPending} data-testid="api-key-create">
              {criar.isPending ? "Criando…" : "Criar chave"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
