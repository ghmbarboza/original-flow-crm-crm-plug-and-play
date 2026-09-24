import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Mic, Phone, PhoneCall, PhoneOutgoing, Play, Plug, RefreshCw, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useElevenLabsVoices } from "@/hooks/useElevenLabsVoices";
import { useContactOptions } from "@/hooks/useAgenda";
import { formatDateTime } from "@/lib/format";
import {
  CALL_CATEGORY_LABEL, CALL_STATUS_LABEL, INBOUND_LABEL, useCalls, useCreateVoiceCampaign, useRecordingUrl, useSaveVoiceAgent, useSetCampaignStatus,
  useVoiceAction, useVoiceCampaigns, useVoiceStatus, type Call, type VoiceStatus,
} from "@/hooks/useVoz";

const SECOES = ["numeros", "agente", "ligacoes", "campanhas"] as const;
type Secao = (typeof SECOES)[number];
const SEM_VOZ = "__default__";
const SEM_NUMERO = "__any__";

function erro(e: unknown, padrao: string) {
  toast.error(e instanceof Error ? e.message : padrao);
}

/** Voz: números Twilio conectados ao ElevenLabs, agente de voz, ligações (ao vivo) e campanhas. */
export default function VozPage() {
  const [params, setParams] = useSearchParams();
  const secaoParam = params.get("secao");
  const secao: Secao = (SECOES as readonly string[]).includes(secaoParam ?? "") ? (secaoParam as Secao) : "ligacoes";
  const trocar = (v: string) => { const p = new URLSearchParams(params); p.set("secao", v); setParams(p, { replace: true }); };
  const { data: status, isLoading, error } = useVoiceStatus();

  return (
    <AppShell>
      <div className="space-y-4" data-testid="voz-page">
        <div className="flex items-center gap-3">
          <Mic className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>Voz</h1>
        </div>
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>A IA atende e faz ligações pelo seu número, com o mesmo perfil, base de conhecimento e agenda do WhatsApp. Cada ligação vira transcrição, resumo e classificação na ficha do contato.</p>
        {error ? <ErrorState title="Não foi possível carregar a voz" error={error} /> : isLoading || !status ? <Skeleton className="h-40 w-full" /> : !vozPronta(status) ? (
          <ConectarVoz status={status} />
        ) : (
          <Tabs value={secao} onValueChange={trocar} className="space-y-4">
            <TabsList>
              <TabsTrigger value="ligacoes" data-testid="voz-tab-ligacoes">Ligações</TabsTrigger>
              <TabsTrigger value="numeros" data-testid="voz-tab-numeros">Números</TabsTrigger>
              <TabsTrigger value="agente" data-testid="voz-tab-agente">Agente de voz</TabsTrigger>
              <TabsTrigger value="campanhas" data-testid="voz-tab-campanhas">Campanhas</TabsTrigger>
            </TabsList>
            <TabsContent value="ligacoes"><Ligacoes status={status} /></TabsContent>
            <TabsContent value="numeros"><Numeros status={status} /></TabsContent>
            <TabsContent value="agente"><Agente status={status} /></TabsContent>
            <TabsContent value="campanhas"><Campanhas status={status} /></TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}

function numeroPronto(status: VoiceStatus) {
  return status.numbers.some((n) => n.status === "active" && n.elevenlabs_phone_number_id);
}
function vozPronta(status: VoiceStatus) {
  return status.credentials.ok && numeroPronto(status);
}

/**
 * Antes de tudo estar conectado a página não tem o que mostrar: mesmo padrão do
 * Email e do WhatsApp, um único estado vazio que diz o próximo passo e leva até ele.
 * Passo 1: credenciais em Configurações > Integrações. Passo 2: conectar um número
 * (o agente de voz é sincronizado junto). Depois disso a tela completa aparece.
 */
function ConectarVoz({ status }: { status: VoiceStatus }) {
  const { isAdmin } = useAuth();
  const credenciais = status.credentials.ok;
  if (!credenciais) {
    return (
      <EmptyState
        icon={Plug}
        title="Conecte a voz da IA"
        description={isAdmin
          ? "Para atender e fazer ligações, a IA precisa de um número no Twilio e da voz do ElevenLabs. Primeiro cadastre as credenciais dos dois em Configurações > Integrações; depois volte aqui para conectar o número."
          : "Para atender e fazer ligações, a IA precisa de um número no Twilio e da voz do ElevenLabs. Peça a um administrador para cadastrar as credenciais em Configurações > Integrações."}
        action={isAdmin && (
          <Button asChild className="gap-1.5" data-testid="voz-abrir-integracoes">
            <Link to="/settings/integrations?integration=twilio">Configurar credenciais <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Link>
          </Button>
        )}
        className="mx-auto max-w-2xl"
      />
    );
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="voz-conectar-numero">
      <EmptyState
        icon={Phone}
        title="Falta conectar um número"
        description={isAdmin
          ? "As credenciais já estão cadastradas. Agora importe um número que você já tem no Twilio ou compre um novo; ele é ligado ao agente de voz automaticamente, e é o último passo."
          : "As credenciais já estão cadastradas. Peça a um administrador para conectar um número de telefone."}
        action={isAdmin && (
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to="/settings/integrations?integration=twilio">Rever credenciais <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Link>
          </Button>
        )}
      />
      {status.agent.last_error && <p className="text-xs" style={{ color: "var(--via-danger)" }}>Último erro ao conectar: {status.agent.last_error}</p>}
      {isAdmin && <ConectarNumero />}
    </div>
  );
}

/** Importar um número da conta Twilio ou comprar um novo. Usado no estado vazio e na aba Números. */
function ConectarNumero() {
  const acao = useVoiceAction();
  const [busca, setBusca] = useState({ area_code: "48", contains: "" });
  const [disponiveis, setDisponiveis] = useState<{ phone_number: string; friendly_name: string; locality: string | null }[] | null>(null);
  const [importar, setImportar] = useState("");
  const rodar = async (body: Record<string, unknown>, ok: string) => {
    try { const r = await acao.mutateAsync(body); toast.success(ok); return r; } catch (e) { erro(e, "Falhou."); return null; }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="via-card space-y-3 p-5">
        <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Importar número que já tenho no Twilio</h3>
        <div className="flex gap-2">
          <Input value={importar} onChange={(e) => setImportar(e.target.value)} placeholder="+5548999990000" data-testid="voz-importar-numero" />
          <Button size="sm" onClick={async () => { if (await rodar({ action: "numbers_import", phone_number: importar }, "Número importado e conectado ao agente.")) setImportar(""); }} disabled={acao.isPending || !importar.trim()} data-testid="voz-importar">Conectar</Button>
        </div>
      </div>
      <div className="via-card space-y-3 p-5">
        <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Comprar número novo</h3>
        <div className="flex gap-2">
          <Input value={busca.area_code} onChange={(e) => setBusca({ ...busca, area_code: e.target.value })} placeholder="DDD" className="w-20" aria-label="DDD" />
          <Input value={busca.contains} onChange={(e) => setBusca({ ...busca, contains: e.target.value })} placeholder="contém (opcional)" aria-label="Contém" />
          <Button size="sm" variant="outline" onClick={async () => { const r = await rodar({ action: "numbers_search", country: "BR", ...busca }, "Busca feita."); if (r) setDisponiveis((r.numbers as typeof disponiveis) ?? []); }} disabled={acao.isPending}><Search className="mr-1 h-4 w-4" strokeWidth={1.5} /> Buscar</Button>
        </div>
        {disponiveis && (disponiveis.length === 0 ? <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Nenhum número disponível com esse filtro.</p> : (
          <ul className="space-y-1">
            {disponiveis.map((d) => (
              <li key={d.phone_number} className="flex items-center justify-between text-sm" style={{ color: "var(--via-text-body)" }}>
                <span>{d.friendly_name}{d.locality ? ` · ${d.locality}` : ""}</span>
                <Button size="sm" variant="outline" onClick={() => rodar({ action: "numbers_buy", phone_number: d.phone_number }, "Número comprado e conectado ao agente.")} disabled={acao.isPending}>Comprar</Button>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

function Numeros({ status }: { status: VoiceStatus }) {
  const { isAdmin } = useAuth();
  const acao = useVoiceAction();

  const rodar = async (body: Record<string, unknown>, ok: string) => {
    try { const r = await acao.mutateAsync(body); toast.success(ok); return r; } catch (e) { erro(e, "Falhou."); return null; }
  };

  return (
    <div className="space-y-5" data-testid="voz-numeros">
      <p className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--via-text-muted)" }} data-testid="voz-credenciais">
        <span>Credenciais do Twilio e do ElevenLabs cadastradas em Configurações &gt; Integrações.</span>
        {isAdmin && <Link to="/settings/integrations?integration=twilio" className="underline" data-testid="voz-gerenciar-credenciais">Gerenciar</Link>}
      </p>

      <div className="via-card space-y-3 p-5">
        <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Meus números</h3>
        {status.numbers.length === 0 ? <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhum número ainda. Importe um número da sua conta Twilio ou compre um novo abaixo.</p> : (
          <ul className="divide-y" style={{ borderColor: "var(--via-border)" }} data-testid="voz-lista-numeros">
            {status.numbers.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`voz-numero-${n.e164}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{n.e164}{n.label ? ` · ${n.label}` : ""}</p>
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{n.elevenlabs_phone_number_id ? "conectado ao agente" : "não conectado ao agente"}{(n.metadata as { error?: string } | null)?.error ? ` · ${(n.metadata as { error?: string }).error}` : ""}</p>
                </div>
                <Badge variant={n.status === "active" && n.elevenlabs_phone_number_id ? "default" : "secondary"}>{n.status === "active" && n.elevenlabs_phone_number_id ? "pronto" : n.status}</Badge>
                {isAdmin && (
                  <>
                    <Select value={n.inbound_behavior} onValueChange={(v) => rodar({ action: "number_update", phone_number_id: n.id, inbound_behavior: v }, "Comportamento salvo.")}>
                      <SelectTrigger className="h-8 w-56" aria-label="Ligações recebidas"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(INBOUND_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="flex items-center gap-1"><Switch checked={n.outbound_enabled} onCheckedChange={(v) => rodar({ action: "number_update", phone_number_id: n.id, outbound_enabled: v }, "Salvo.")} aria-label="Liga por este número" /><span className="text-xs" style={{ color: "var(--via-text-muted)" }}>liga</span></div>
                    {!n.elevenlabs_phone_number_id && <Button size="sm" variant="outline" onClick={() => rodar({ action: "number_update", phone_number_id: n.id, reconnect: true }, "Número conectado ao agente.")}>Conectar ao agente</Button>}
                    <Button size="sm" variant="ghost" onClick={() => rodar({ action: "number_release", phone_number_id: n.id }, "Número removido.")} aria-label={`Remover ${n.e164}`}><Trash2 className="h-4 w-4" strokeWidth={1.5} /></Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {isAdmin && <ConectarNumero />}
    </div>
  );
}

function Agente({ status }: { status: VoiceStatus }) {
  const { isAdmin } = useAuth();
  const salvar = useSaveVoiceAgent();
  const acao = useVoiceAction();
  const { data: vozes } = useElevenLabsVoices();
  const [form, setForm] = useState({ voice_id: status.agent.voice_id ?? "", first_message: status.agent.first_message, max_duration_seconds: status.agent.max_duration_seconds, prompt_extra: status.agent.prompt_extra ?? "" });
  useEffect(() => { setForm({ voice_id: status.agent.voice_id ?? "", first_message: status.agent.first_message, max_duration_seconds: status.agent.max_duration_seconds, prompt_extra: status.agent.prompt_extra ?? "" }); }, [status.agent]);

  const gravar = async () => {
    try {
      await salvar.mutateAsync({ voice_id: form.voice_id || null, first_message: form.first_message, max_duration_seconds: form.max_duration_seconds, prompt_extra: form.prompt_extra || null });
      toast.success("Agente salvo. Sincronize para valer nas ligações.");
    } catch (e) { erro(e, "Não foi possível salvar."); }
  };
  const sincronizar = async () => {
    try { await acao.mutateAsync({ action: "agent_sync" }); toast.success("Agente sincronizado no ElevenLabs."); } catch (e) { erro(e, "Não foi possível sincronizar."); }
  };
  const listaVozes = (vozes ?? []) as { voice_id: string; name: string }[];

  return (
    <div className="via-card space-y-4 p-5" data-testid="voz-agente">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Agente de voz</h3>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Usa a personalidade, os fatos da base de conhecimento e a agenda configurados em <Link to="/settings/ia" className="underline">Configurações &gt; IA</Link>. Aqui só o que é da voz.</p>
        </div>
        <p className="text-xs" style={{ color: status.agent.last_error ? "var(--via-danger)" : "var(--via-text-muted)" }} data-testid="voz-agente-status">
          {status.agent.last_error ? `Erro: ${status.agent.last_error}` : status.agent.synced_at ? `Sincronizado ${formatDateTime(status.agent.synced_at)}` : "Ainda não sincronizado"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Voz</Label>
          <Select value={form.voice_id || SEM_VOZ} onValueChange={(v) => setForm({ ...form, voice_id: v === SEM_VOZ ? "" : v })}>
            <SelectTrigger aria-label="Voz" data-testid="voz-agente-voz"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_VOZ}>Voz padrão</SelectItem>
              {listaVozes.map((v) => <SelectItem key={v.voice_id} value={v.voice_id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ag-dur">Duração máxima da ligação (segundos)</Label>
          <Input id="ag-dur" type="number" min={60} max={1800} value={form.max_duration_seconds} onChange={(e) => setForm({ ...form, max_duration_seconds: Number(e.target.value) || 600 })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ag-first">Primeira frase ao atender ou ao ligar</Label>
        <Input id="ag-first" value={form.first_message} onChange={(e) => setForm({ ...form, first_message: e.target.value })} data-testid="voz-agente-abertura" />
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Variáveis: {"{{agent_name}}"}, {"{{company_name}}"}, {"{{lead_name}}"}, {"{{call_purpose}}"}.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ag-extra">Instruções extras só para a voz (opcional)</Label>
        <Textarea id="ag-extra" rows={3} value={form.prompt_extra} onChange={(e) => setForm({ ...form, prompt_extra: e.target.value })} placeholder="Ex.: se a pessoa estiver dirigindo, ofereça ligar depois." />
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <Button size="sm" onClick={gravar} disabled={salvar.isPending} data-testid="voz-agente-salvar">Salvar</Button>
          <Button size="sm" variant="outline" onClick={sincronizar} disabled={acao.isPending || !status.credentials.ok} data-testid="voz-agente-sync"><RefreshCw className="mr-1 h-4 w-4" strokeWidth={1.5} /> Sincronizar no ElevenLabs</Button>
        </div>
      )}
    </div>
  );
}

function Ligacoes({ status }: { status: VoiceStatus }) {
  const { data: ligacoes, isLoading } = useCalls();
  const acao = useVoiceAction();
  const gravacao = useRecordingUrl();
  const [busca, setBusca] = useState("");
  const { data: contatos } = useContactOptions(busca);
  const [contato, setContato] = useState<string>("");
  const [instrucao, setInstrucao] = useState("");
  const [aberta, setAberta] = useState<Call | null>(null);
  const pronto = status.numbers.some((n) => n.elevenlabs_phone_number_id && n.outbound_enabled) && !!status.agent.elevenlabs_agent_id;

  const ligar = async () => {
    try {
      await acao.mutateAsync({ action: "call_outbound", contact_id: contato, instruction: instrucao });
      toast.success("Ligando… acompanhe abaixo.");
      setInstrucao("");
    } catch (e) { erro(e, "Não foi possível ligar."); }
  };
  const ouvir = async (c: Call) => {
    if (!c.recording_path) return;
    try { window.open(await gravacao.mutateAsync(c.recording_path), "_blank", "noopener,noreferrer"); } catch (e) { erro(e, "Gravação indisponível."); }
  };

  return (
    <div className="space-y-5" data-testid="voz-ligacoes">
      <div className="via-card space-y-3 p-5">
        <h3 className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}><PhoneOutgoing className="h-4 w-4" strokeWidth={1.5} /> Ligar para um contato</h3>
        {!pronto && <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Para ligar, conecte um número ao agente em Números e sincronize o agente de voz.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Input placeholder="Buscar contato pelo primeiro nome" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="voz-ligar-busca" />
          <Select value={contato || SEM_NUMERO} onValueChange={(v) => setContato(v === SEM_NUMERO ? "" : v)}>
            <SelectTrigger aria-label="Contato" data-testid="voz-ligar-contato"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_NUMERO}>Escolha o contato</SelectItem>
              {(contatos ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Motivo da ligação (opcional)" value={instrucao} onChange={(e) => setInstrucao(e.target.value)} />
        </div>
        <Button size="sm" onClick={ligar} disabled={!pronto || !contato || acao.isPending} data-testid="voz-ligar"><PhoneCall className="mr-1 h-4 w-4" strokeWidth={1.5} /> Ligar pela IA</Button>
      </div>

      <div className="via-card space-y-3 p-5">
        <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Ligações (ao vivo e histórico)</h3>
        {isLoading ? <Skeleton className="h-16 w-full" /> : (ligacoes ?? []).length === 0 ? <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhuma ligação ainda.</p> : (
          <ul className="divide-y" style={{ borderColor: "var(--via-border)" }} data-testid="voz-lista-ligacoes">
            {(ligacoes ?? []).map((c) => {
              const cls = c.classification as { category?: string } | null;
              const viva = ["queued", "ringing", "in_progress"].includes(c.status);
              return (
                <li key={c.id} className="py-3" data-testid={`voz-ligacao-${c.id}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Phone className="h-4 w-4" strokeWidth={1.5} style={{ color: viva ? "var(--via-success)" : "var(--via-text-muted)" }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                        {c.contacts ? <Link to={`/contacts/${c.contact_id}`} className="underline-offset-2 hover:underline">{[c.contacts.first_name, c.contacts.last_name].filter(Boolean).join(" ")}</Link> : c.direction === "inbound" ? c.from_number : c.to_number}
                        <span className="ml-2 text-xs font-normal" style={{ color: "var(--via-text-muted)" }}>{c.direction === "inbound" ? "recebida" : "feita pela IA"} · {formatDateTime(c.created_at)}{c.duration_seconds ? ` · ${c.duration_seconds}s` : ""}</span>
                      </p>
                      {c.summary && <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{c.summary}</p>}
                    </div>
                    <Badge variant={viva ? "default" : "secondary"}>{CALL_STATUS_LABEL[c.status] ?? c.status}</Badge>
                    {cls?.category && <Badge variant="outline">{CALL_CATEGORY_LABEL[cls.category] ?? cls.category}</Badge>}
                    {c.recording_path && <Button size="sm" variant="ghost" onClick={() => ouvir(c)} aria-label="Ouvir gravação"><Play className="h-4 w-4" strokeWidth={1.5} /></Button>}
                    {(c.transcript as unknown[])?.length > 0 && <Button size="sm" variant="ghost" onClick={() => setAberta(aberta?.id === c.id ? null : c)}>{aberta?.id === c.id ? "Fechar" : "Transcrição"}</Button>}
                    {viva && <Button size="sm" variant="ghost" onClick={() => acao.mutateAsync({ action: "call_cancel", call_id: c.id }).catch((e) => erro(e, "Falhou"))}>Encerrar</Button>}
                  </div>
                  {aberta?.id === c.id && (
                    <ul className="mt-2 space-y-1 rounded-md border p-3 text-sm" style={{ borderColor: "var(--via-border)", color: "var(--via-text-body)" }} data-testid="voz-transcricao">
                      {(c.transcript as { role: string; message: string }[]).map((t, i) => <li key={i}><span style={{ color: "var(--via-text-muted)" }}>{t.role === "agent" ? "IA" : "Cliente"}:</span> {t.message}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Campanhas({ status }: { status: VoiceStatus }) {
  const { isAdmin } = useAuth();
  const { data: campanhas, isLoading } = useVoiceCampaigns();
  const criar = useCreateVoiceCampaign();
  const mudar = useSetCampaignStatus();
  const [form, setForm] = useState({ name: "", instruction: "", phone_number_id: "", max_concurrent: 2, busca: "", selecionados: [] as string[] });
  const { data: contatos } = useContactOptions(form.busca);
  const numeros = useMemo(() => status.numbers.filter((n) => n.elevenlabs_phone_number_id && n.outbound_enabled), [status.numbers]);

  const gravar = async () => {
    try {
      await criar.mutateAsync({ name: form.name, instruction: form.instruction, phone_number_id: form.phone_number_id || null, contact_ids: form.selecionados, max_concurrent: form.max_concurrent });
      toast.success("Campanha criada. As ligações começam em até um minuto.");
      setForm({ name: "", instruction: "", phone_number_id: "", max_concurrent: 2, busca: "", selecionados: [] });
    } catch (e) { erro(e, "Não foi possível criar a campanha."); }
  };

  return (
    <div className="space-y-5" data-testid="voz-campanhas">
      {!isAdmin && <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Campanhas de ligação são criadas por administradores. Você acompanha o andamento abaixo.</p>}
      {isAdmin && <div className="via-card space-y-3 p-5">
        <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Nova campanha de ligações</h3>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>A IA liga para cada contato da lista, no máximo {form.max_concurrent} por vez, e registra o resultado na ficha.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="cp-nome">Nome</Label><Input id="cp-nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="voz-campanha-nome" /></div>
          <div className="space-y-1">
            <Label>Número</Label>
            <Select value={form.phone_number_id || SEM_NUMERO} onValueChange={(v) => setForm({ ...form, phone_number_id: v === SEM_NUMERO ? "" : v })}>
              <SelectTrigger aria-label="Número"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={SEM_NUMERO}>Qualquer número pronto</SelectItem>{numeros.map((n) => <SelectItem key={n.id} value={n.id}>{n.e164}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="cp-conc">Ligações simultâneas</Label><Input id="cp-conc" type="number" min={1} max={10} value={form.max_concurrent} onChange={(e) => setForm({ ...form, max_concurrent: Number(e.target.value) || 2 })} /></div>
        </div>
        <div className="space-y-1"><Label htmlFor="cp-instr">O que a IA deve fazer nesta ligação</Label><Textarea id="cp-instr" rows={2} value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} placeholder="Ex.: convidar para o evento de sábado e confirmar presença" /></div>
        <div className="space-y-1">
          <Label>Contatos ({form.selecionados.length} escolhidos)</Label>
          <Input placeholder="Buscar pelo primeiro nome" value={form.busca} onChange={(e) => setForm({ ...form, busca: e.target.value })} />
          <ul className="max-h-40 overflow-y-auto text-sm">
            {(contatos ?? []).map((c) => {
              const marcado = form.selecionados.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 py-1" style={{ color: "var(--via-text-body)" }}>
                    <input type="checkbox" checked={marcado} onChange={() => setForm({ ...form, selecionados: marcado ? form.selecionados.filter((x) => x !== c.id) : [...form.selecionados, c.id] })} />
                    {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        <Button size="sm" onClick={gravar} disabled={criar.isPending || !form.name.trim() || form.selecionados.length === 0} data-testid="voz-campanha-criar">Iniciar campanha</Button>
      </div>}
      <div className="via-card space-y-3 p-5">
        <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Campanhas</h3>
        {isLoading ? <Skeleton className="h-12 w-full" /> : (campanhas ?? []).length === 0 ? <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhuma campanha ainda.</p> : (
          <ul className="divide-y" style={{ borderColor: "var(--via-border)" }}>
            {(campanhas ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`voz-campanha-${c.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{c.name}</p>
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{c.total} contatos · {c.placed} ligadas · {c.completed} concluídas · {c.failed} falhas · {formatDateTime(c.created_at)}</p>
                </div>
                <Badge variant={c.status === "running" ? "default" : "secondary"}>{c.status}</Badge>
                {isAdmin && c.status === "running" && <Button size="sm" variant="ghost" onClick={() => mudar.mutateAsync({ id: c.id, status: "paused" }).catch((e) => erro(e, "Falhou"))}>Pausar</Button>}
                {isAdmin && c.status === "paused" && <Button size="sm" variant="ghost" onClick={() => mudar.mutateAsync({ id: c.id, status: "running" }).catch((e) => erro(e, "Falhou"))}>Retomar</Button>}
                {isAdmin && ["running", "paused"].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => mudar.mutateAsync({ id: c.id, status: "canceled" }).catch((e) => erro(e, "Falhou"))}>Cancelar</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
