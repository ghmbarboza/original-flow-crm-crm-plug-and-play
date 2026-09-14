import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Copy, KeyRound, Pencil, Plus, RefreshCw, RotateCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DesconectarIntegracao } from "@/components/settings/DesconectarIntegracao";
import {
  WEBHOOK_ACOES_ENTRADA, WEBHOOK_EVENTOS_SAIDA, useCreateWebhookKey, useDeleteWebhookEndpoint,
  useRedeliverWebhook, useRegenerateWebhookSecret, useSaveWebhookEndpoint, useSetWebhookKeyActive,
  useTestWebhookEndpoint, useWebhookDeliveries, useWebhookEndpoints, useWebhookInboundKeys,
  useWebhookInboundLogs, type EndpointInput, type WebhookEndpoint,
} from "@/hooks/useWebhooks";
import { formatDateTime } from "@/lib/format";

/**
 * Configurações > Integrações > Webhooks (Sprint 11).
 *
 * A ponte com as outras soluções do Viver de IA, n8n, Make ou qualquer sistema:
 * - Enviar: destinos que recebem os eventos do CRM, cada um com seus eventos e
 *   seu secret, com teste, histórico de entregas e reenvio.
 * - Receber: uma chave por solução que manda dados para o CRM, com a URL, os
 *   exemplos de payload e o log das chamadas.
 */

async function copiar(texto: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${rotulo} copiado.`);
  } catch {
    toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie à mão.");
  }
}

const STATUS_ENTREGA: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  success: { label: "entregue", variant: "secondary" },
  pending: { label: "na fila", variant: "outline" },
  sending: { label: "enviando", variant: "outline" },
  retrying: { label: "nova tentativa", variant: "outline" },
  failed: { label: "falhou", variant: "destructive" },
};

const VAZIO: EndpointInput = { name: "", url: "", events: [], is_active: true };

function FormularioDestino({ inicial, onFechar }: { inicial: EndpointInput; onFechar: () => void }) {
  const salvar = useSaveWebhookEndpoint();
  const [form, setForm] = useState<EndpointInput>(inicial);
  const todos = form.events.includes("*");

  const alternar = (evento: string, marcado: boolean) => {
    setForm((f) => {
      const semTodos = f.events.filter((e) => e !== "*");
      if (evento === "*") return { ...f, events: marcado ? ["*"] : [] };
      return { ...f, events: marcado ? [...semTodos, evento] : semTodos.filter((e) => e !== evento) };
    });
  };

  const submeter = async () => {
    try {
      await salvar.mutateAsync(form);
      toast.success(form.id ? "Destino atualizado." : "Destino criado. Use Testar para conferir a conexão.");
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o destino.");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--via-border)" }} data-testid="webhook-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wh-nome">Nome</Label>
          <Input id="wh-nome" placeholder="Ex.: Plataforma de Lançamento" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wh-url">URL de destino</Label>
          <Input id="wh-url" placeholder="https://..." value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })} />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Eventos</legend>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
          <Checkbox checked={todos} onCheckedChange={(v) => alternar("*", v === true)} />
          Todos os eventos, inclusive os que forem criados depois
        </label>
        {!todos && (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {WEBHOOK_EVENTOS_SAIDA.map((ev) => (
              <label key={ev.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
                <Checkbox checked={form.events.includes(ev.value)} onCheckedChange={(v) => alternar(ev.value, v === true)} />
                {ev.label} <code className="text-xs" style={{ color: "var(--via-text-muted)" }}>{ev.value}</code>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
        Ativo
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button onClick={submeter} disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar destino"}</Button>
      </div>
    </div>
  );
}

function Entregas({ endpointId }: { endpointId: string }) {
  const { data: entregas, isLoading } = useWebhookDeliveries(endpointId);
  const reenviar = useRedeliverWebhook();

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!entregas?.length) {
    return <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Nenhuma entrega ainda.</p>;
  }
  return (
    <div className="max-h-64 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Evento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Resposta</TableHead>
            <TableHead>Quando</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entregas.map((e) => {
            const st = STATUS_ENTREGA[e.status] ?? STATUS_ENTREGA.pending;
            return (
              <TableRow key={e.id} data-testid="webhook-delivery-row">
                <TableCell className="font-mono text-xs">{e.event}</TableCell>
                <TableCell>
                  <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                  {e.attempts > 1 && <span className="ml-1 text-xs" style={{ color: "var(--via-text-muted)" }}>{e.attempts} tentativas</span>}
                </TableCell>
                <TableCell className="max-w-56 truncate text-xs" title={e.last_error ?? e.last_response ?? undefined}>
                  {e.last_error ?? (e.last_status_code ? `HTTP ${e.last_status_code}` : "")}
                </TableCell>
                <TableCell className="text-xs tabular-nums">{formatDateTime(e.created_at)}</TableCell>
                <TableCell>
                  {(e.status === "failed" || e.status === "retrying") && (
                    <Button
                      size="sm" variant="ghost" className="gap-1" disabled={reenviar.isPending}
                      onClick={async () => {
                        try {
                          await reenviar.mutateAsync({ id: e.id, endpoint_id: endpointId });
                          toast.success("Reenviado e aceito pelo destino.");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "O reenvio falhou.");
                        }
                      }}
                    >
                      <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} /> Reenviar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CartaoDestino({ destino }: { destino: WebhookEndpoint }) {
  const [editando, setEditando] = useState(false);
  const [verEntregas, setVerEntregas] = useState(false);
  const [verSecret, setVerSecret] = useState(false);
  const testar = useTestWebhookEndpoint();
  const excluir = useDeleteWebhookEndpoint();
  const regenerar = useRegenerateWebhookSecret();

  if (editando) {
    return (
      <FormularioDestino
        inicial={{ id: destino.id, name: destino.name, url: destino.url, events: destino.events, is_active: destino.is_active }}
        onFechar={() => setEditando(false)}
      />
    );
  }

  const eventos = destino.events.includes("*") ? "todos os eventos" : `${destino.events.length} evento(s)`;
  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--via-border)" }} data-testid="webhook-endpoint">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            {destino.name}{" "}
            <Badge variant={destino.is_active ? "secondary" : "outline"} className="ml-1 text-xs">
              {destino.is_active ? "ativo" : "desativado"}
            </Badge>
          </p>
          <p className="truncate font-mono text-xs" style={{ color: "var(--via-text-muted)" }}>{destino.url}</p>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            {eventos}
            {destino.last_success_at && ` · última entrega ${formatDateTime(destino.last_success_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={testar.isPending}
            onClick={async () => {
              try {
                const r = await testar.mutateAsync(destino.id);
                toast.success(`O destino aceitou o teste (HTTP ${r.status_code}).`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "O destino não aceitou o teste.");
              }
            }}>
            <Send className="h-3.5 w-3.5" strokeWidth={1.5} /> {testar.isPending ? "Testando…" : "Testar"}
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditando(true)}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} /> Editar
          </Button>
          <DesconectarIntegracao
            titulo={`Excluir o destino "${destino.name}"?`}
            consequencia="Os próximos eventos deixam de ser enviados para esta URL e o histórico de entregas dela é apagado. Quem recebe não é avisado."
            rotulo="Excluir"
            onConfirmar={async () => {
              try {
                await excluir.mutateAsync(destino.id);
                toast.success("Destino excluído.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
              }
            }}
          />
        </div>
      </div>

      {destino.consecutive_failures >= 3 && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--via-danger, #dc2626)" }}>
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
          {destino.consecutive_failures} entregas seguidas falharam. Veja a resposta do destino abaixo.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>Secret (assinatura HMAC):</span>
        <code className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}>
          {verSecret ? destino.secret : `${destino.secret.slice(0, 6)}••••••`}
        </code>
        <Button size="sm" variant="ghost" onClick={() => setVerSecret((v) => !v)}>{verSecret ? "Ocultar" : "Mostrar"}</Button>
        <Button size="sm" variant="ghost" className="gap-1" onClick={() => copiar(destino.secret, "Secret")}>
          <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Button>
        <Button size="sm" variant="ghost" className="gap-1" disabled={regenerar.isPending}
          onClick={async () => {
            try {
              await regenerar.mutateAsync(destino.id);
              toast.success("Novo secret gerado. Atualize a verificação no destino: o anterior parou de valer.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível gerar outro secret.");
            }
          }}>
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} /> Trocar
        </Button>
      </div>

      <Button size="sm" variant="ghost" className="gap-1 px-0" onClick={() => setVerEntregas((v) => !v)}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verEntregas ? "rotate-180" : ""}`} strokeWidth={1.5} />
        Últimas entregas
      </Button>
      {verEntregas && <Entregas endpointId={destino.id} />}
    </div>
  );
}

function Receber() {
  const { data: chaves } = useWebhookInboundKeys();
  const { data: logs } = useWebhookInboundLogs();
  const criar = useCreateWebhookKey();
  const alternar = useSetWebhookKeyActive();
  const [nome, setNome] = useState("");
  const [nova, setNova] = useState<string | null>(null);
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-inbound`;

  const exemploCurl = (chave: string) =>
    `curl -X POST ${url} \\\n  -H "Authorization: Bearer ${chave}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event":"lead.created","data":{"name":"Maria","email":"maria@empresa.com"}}'`;

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold" style={{ color: "var(--via-text-primary)" }}>Receber dados (outra solução → FlowCRM)</h4>
      <div className="space-y-1.5">
        <Label htmlFor="wh-inbound-url">URL do webhook de entrada</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="wh-inbound-url" readOnly className="min-w-64 flex-1 text-xs" value={url} />
          <Button variant="outline" className="gap-1.5" onClick={() => copiar(url, "URL")}>
            <Copy className="h-4 w-4" strokeWidth={1.5} /> Copiar
          </Button>
        </div>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Autentique com a chave no header <code>Authorization: Bearer fcrm_...</code> (ou <code>x-webhook-token</code>).
          Mande <code>Idempotency-Key</code> para a mesma chamada nunca ser processada duas vezes.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-48 flex-1" placeholder="Nome da chave (ex.: TypeFlow)" value={nome}
            onChange={(e) => setNome(e.target.value)} data-testid="webhook-key-name" />
          <Button className="gap-1.5" disabled={criar.isPending}
            onClick={async () => {
              try {
                const r = await criar.mutateAsync(nome);
                setNova(r.key);
                setNome("");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Não foi possível criar a chave.");
              }
            }}>
            <KeyRound className="h-4 w-4" strokeWidth={1.5} /> Criar chave
          </Button>
        </div>

        {nova && (
          <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--via-warning, #d97706)" }} data-testid="webhook-new-key">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Copie a chave agora: ela não aparece de novo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input readOnly className="min-w-64 flex-1 font-mono text-xs" value={nova} />
              <Button variant="outline" className="gap-1.5" onClick={() => copiar(nova, "Chave")}>
                <Copy className="h-4 w-4" strokeWidth={1.5} /> Copiar
              </Button>
            </div>
            <pre className="overflow-x-auto rounded p-2 text-xs" style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}>
              {exemploCurl(nova)}
            </pre>
            <Button size="sm" variant="ghost" onClick={() => setNova(null)}>Já copiei</Button>
          </div>
        )}

        {(chaves ?? []).map((k) => (
          <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
            style={{ borderColor: "var(--via-border)" }} data-testid="webhook-key-row">
            <div>
              <p className="text-sm" style={{ color: "var(--via-text-primary)" }}>{k.name}</p>
              <p className="font-mono text-xs" style={{ color: "var(--via-text-muted)" }}>
                {k.key_prefix}… · {k.last_used_at ? `usada ${formatDateTime(k.last_used_at)}` : "nunca usada"}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--via-text-body)" }}>
              <Switch
                checked={k.is_active}
                aria-label={`Chave ${k.name} ativa`}
                onCheckedChange={async (v) => {
                  try {
                    await alternar.mutateAsync({ id: k.id, ativa: v });
                    toast.success(v ? "Chave reativada." : "Chave revogada: chamadas com ela passam a ser recusadas.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Não foi possível alterar a chave.");
                  }
                }}
              />
              {k.is_active ? "ativa" : "revogada"}
            </label>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>O que o FlowCRM entende</p>
        {WEBHOOK_ACOES_ENTRADA.map((a) => (
          <details key={a.value} className="rounded-lg border p-3" style={{ borderColor: "var(--via-border)" }}>
            <summary className="cursor-pointer text-sm" style={{ color: "var(--via-text-body)" }}>
              <code className="text-xs">{a.value}</code> {a.label}
            </summary>
            <pre className="mt-2 overflow-x-auto rounded p-2 text-xs" style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}>
              {a.example}
            </pre>
          </details>
        ))}
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Também aceita os nomes que as soluções já usam (envelope.completed, transaction.confirmed, booking.created,
          feedback.received…) e, sem campo event, trata o corpo como um lead novo.
        </p>
      </div>

      {(logs ?? []).length > 0 && (
        <div className="max-h-64 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ação</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Detalhe</TableHead>
                <TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs ?? []).map((l) => (
                <TableRow key={l.id} data-testid="webhook-inbound-log-row">
                  <TableCell className="font-mono text-xs">{l.action ?? "(inválida)"}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "failed" ? "destructive" : l.status === "success" ? "secondary" : "outline"} className="text-xs">
                      {l.status === "success" ? "ok" : l.status === "failed" ? `erro ${l.http_status}` : l.status === "duplicate" ? "repetida" : "processando"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-xs" title={l.error ?? undefined}>{l.error ?? ""}</TableCell>
                  <TableCell className="text-xs tabular-nums">{formatDateTime(l.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

export default function WebhooksSettings() {
  const { data: destinos, isLoading } = useWebhookEndpoints();
  const [criando, setCriando] = useState(false);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold" style={{ color: "var(--via-text-primary)" }}>Enviar eventos (FlowCRM → outra solução)</h4>
          {!criando && (
            <Button size="sm" className="gap-1.5" onClick={() => setCriando(true)} data-testid="webhook-new-endpoint">
              <Plus className="h-4 w-4" strokeWidth={1.5} /> Novo destino
            </Button>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Cada entrega leva os headers X-FlowCRM-Event, X-FlowCRM-Timestamp e X-FlowCRM-Signature
          (sha256 do HMAC de "timestamp.corpo" com o secret). Se o destino não responder 2xx, o FlowCRM
          tenta de novo em 1 min, 5 min, 30 min, 2 h e 12 h.
        </p>
        {criando && <FormularioDestino inicial={VAZIO} onFechar={() => setCriando(false)} />}
        {(destinos ?? []).map((d) => <CartaoDestino key={d.id} destino={d} />)}
        {!criando && !(destinos ?? []).length && (
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhum destino cadastrado.</p>
        )}
      </section>

      <Separator />
      <Receber />
    </div>
  );
}
