import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CalendarCheck, CheckCircle2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import { useMessageTemplates } from "@/hooks/useMessageTemplates";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";
import { WEEKDAY_LABEL, useCalendarAction, useCalendarStatus, useSaveSchedulingPolicy, useSchedulingPolicy, type SchedulingPolicy } from "@/hooks/useAgenda";

const SEM_DONO = "__none__";
const SEM_TEMPLATE = "__none__";

type Politica = Omit<SchedulingPolicy, "org_id" | "updated_at">;
const PADRAO: Politica = {
  ai_enabled: false, default_duration_minutes: 30, buffer_minutes: 15, min_notice_minutes: 120, max_days_ahead: 60, weekdays: [1, 2, 3, 4, 5],
  start_time: "09:00", end_time: "18:00", require_literal_confirmation: true, default_owner_id: null, reminder_minutes_before: 1440,
  reminder_text: 'Oi {{contact.first_name}}! Passando para lembrar da nossa reunião "{{appointment.title}}" em {{appointment.when}}. Responda "confirmo" para confirmar ou me avise se precisar remarcar.',
  reminder_template_name: null, no_show_after_minutes: 15,
  no_show_text: "Oi {{contact.first_name}}, não conseguimos nos falar em {{appointment.when}}. Quer remarcar? Me diga um dia e horário que funcionem para você.",
};

function erro(e: unknown, padrao: string) {
  toast.error(e instanceof Error ? e.message : padrao);
}

/**
 * Configurações > Agenda: calendário do usuário (Nylas), política de agenda da IA
 * e textos de lembrete e no-show. As credenciais do Nylas ficam em Integrações.
 */
export default function AgendaSettings() {
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-6" data-testid="agenda-settings">
      <CalendarioDoUsuario />
      {isAdmin && <PoliticaDeAgenda />}
    </div>
  );
}

function CalendarioDoUsuario() {
  const { isAdmin } = useAuth();
  const { data: status, isLoading } = useCalendarStatus();
  const acao = useCalendarAction();
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const conectado = params.get("calendar_connected");
    const falha = params.get("calendar_error");
    if (!conectado && !falha) return;
    if (conectado) toast.success("Calendário conectado. As reuniões passam a aparecer nele.");
    if (falha) toast.error(`Não foi possível conectar o calendário: ${falha}`);
    const proximos = new URLSearchParams(params);
    proximos.delete("calendar_connected");
    proximos.delete("calendar_error");
    setParams(proximos, { replace: true });
  }, [params, setParams]);

  const conectar = async () => {
    try {
      const r = await acao.mutateAsync({ action: "connect", app_origin: window.location.origin });
      if (r.url) window.location.assign(r.url);
    } catch (e) {
      erro(e, "Não foi possível iniciar a conexão.");
    }
  };
  return (
    <div className="via-card space-y-4 p-5" data-testid="agenda-calendar">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Meu calendário</h2>
      </div>
      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
        Conecte o Google Calendar ou o Outlook pelo Nylas. Reuniões marcadas aqui (pela IA, à mão ou pelo Cal.com) entram no seu calendário com sala de vídeo, e horários já ocupados nele ficam indisponíveis para a IA.
      </p>
      {isLoading ? <Skeleton className="h-10 w-full" /> : status?.integration ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-1.5 text-sm" style={{ color: "var(--via-success)" }}>
            <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} /> Conectado{status.integration.account_email ? `: ${status.integration.account_email}` : ""}{status.integration.last_error ? ` · ${status.integration.last_error}` : ""}
          </p>
          <div className="flex items-center gap-2">
            <Switch checked={status.integration.create_meet} onCheckedChange={(v) => acao.mutateAsync({ action: "update", create_meet: v }).catch((e) => erro(e, "Falhou"))} aria-label="Criar sala de vídeo" />
            <Label>Criar sala de vídeo automaticamente</Label>
          </div>
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => acao.mutateAsync({ action: "disconnect" }).then(() => toast.success("Calendário desconectado.")).catch((e) => erro(e, "Falhou"))} data-testid="calendar-disconnect">
            <Unplug className="h-4 w-4" strokeWidth={1.5} /> Desconectar
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={conectar} disabled={acao.isPending || !status?.credentials_ready} data-testid="calendar-connect">Conectar meu calendário</Button>
      )}
      {!status?.credentials_ready && !isLoading && (
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--via-text-muted)" }}>
          <span>{isAdmin ? "Falta cadastrar as credenciais do Nylas da empresa." : "Peça a um administrador para cadastrar as credenciais do Nylas."}</span>
          {isAdmin && <Button size="sm" variant="link" className="h-auto p-0" asChild><Link to="/settings/integrations?integration=nylas" data-testid="agenda-abrir-integracoes">Cadastrar em Integrações</Link></Button>}
        </div>
      )}
    </div>
  );
}

function PoliticaDeAgenda() {
  const { data: salvo, isLoading } = useSchedulingPolicy();
  const salvar = useSaveSchedulingPolicy();
  const { data: membros } = useOrgMembers();
  const { data: setup } = useWhatsAppSetup();
  const { data: templates } = useMessageTemplates();
  const [p, setP] = useState<Politica>(PADRAO);

  useEffect(() => {
    if (salvo) {
      const { org_id: _o, updated_at: _u, ...resto } = salvo;
      setP({ ...PADRAO, ...resto });
    }
  }, [salvo]);

  const canalOficial = setup?.provider === "meta_official" || setup?.provider === "zernio";
  const aprovados = ((templates as { templates?: { name: string; status: string }[] } | undefined)?.templates ?? []).filter((t) => t.status === "APPROVED");
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : fallback);

  const gravar = async () => {
    try {
      await salvar.mutateAsync(p);
      toast.success("Política de agenda salva.");
    } catch (e) {
      erro(e, "Não foi possível salvar.");
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="via-card space-y-5 p-5" data-testid="agenda-policy">
      <div>
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Agenda da IA</h2>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Quando ligada, a IA consulta horários, marca, remarca e cancela reuniões na conversa, dentro destas regras.</p>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={p.ai_enabled} onCheckedChange={(v) => setP({ ...p, ai_enabled: v })} aria-label="IA agenda reuniões" data-testid="policy-ai-enabled" />
        <Label>A IA pode agendar reuniões na conversa</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={p.require_literal_confirmation} onCheckedChange={(v) => setP({ ...p, require_literal_confirmation: v })} aria-label="Exigir confirmação literal" />
        <Label>Só agir depois que o cliente confirmar com as próprias palavras (recomendado)</Label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Responsável padrão das reuniões da IA</Label>
          <Select value={p.default_owner_id ?? SEM_DONO} onValueChange={(v) => setP({ ...p, default_owner_id: v === SEM_DONO ? null : v })}>
            <SelectTrigger aria-label="Responsável padrão" data-testid="policy-owner"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_DONO}>Sem responsável (só a agenda da empresa)</SelectItem>
              {(membros ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pol-dur">Duração padrão (min)</Label>
          <Input id="pol-dur" type="number" min={15} max={240} value={p.default_duration_minutes} onChange={(e) => setP({ ...p, default_duration_minutes: num(e.target.value, 30) })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pol-buffer">Intervalo entre reuniões (min)</Label>
          <Input id="pol-buffer" type="number" min={0} max={120} value={p.buffer_minutes} onChange={(e) => setP({ ...p, buffer_minutes: num(e.target.value, 15) })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pol-notice">Antecedência mínima (min)</Label>
          <Input id="pol-notice" type="number" min={0} max={10080} value={p.min_notice_minutes} onChange={(e) => setP({ ...p, min_notice_minutes: num(e.target.value, 120) })} data-testid="policy-notice" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pol-ahead">Marcar até (dias à frente)</Label>
          <Input id="pol-ahead" type="number" min={1} max={365} value={p.max_days_ahead} onChange={(e) => setP({ ...p, max_days_ahead: num(e.target.value, 60) })} />
        </div>
        <div className="space-y-1">
          <Label>Expediente</Label>
          <div className="flex items-center gap-2">
            <Input type="time" value={p.start_time.slice(0, 5)} onChange={(e) => setP({ ...p, start_time: e.target.value })} aria-label="Início do expediente" />
            <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>às</span>
            <Input type="time" value={p.end_time.slice(0, 5)} onChange={(e) => setP({ ...p, end_time: e.target.value })} aria-label="Fim do expediente" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Dias de atendimento</Label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABEL.map((nome, i) => {
            const ativo = p.weekdays.includes(i);
            return (
              <Button key={nome} type="button" size="sm" variant={ativo ? "default" : "outline"} onClick={() => setP({ ...p, weekdays: ativo ? p.weekdays.filter((d) => d !== i) : [...p.weekdays, i].sort() })} aria-pressed={ativo}>
                {nome}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--via-border)" }}>
        <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Lembrete e no-show</h3>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          O lembrete vai por WhatsApp para o contato (ou por e-mail quando ele não tem WhatsApp). Variáveis: {"{{contact.first_name}}"}, {"{{appointment.title}}"}, {"{{appointment.when}}"}.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="pol-rem">Lembrar quantos minutos antes (0 desliga)</Label>
            <Input id="pol-rem" type="number" min={0} max={10080} value={p.reminder_minutes_before} onChange={(e) => setP({ ...p, reminder_minutes_before: num(e.target.value, 1440) })} data-testid="policy-reminder" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pol-ns">Marcar como não compareceu após (min do início)</Label>
            <Input id="pol-ns" type="number" min={5} max={240} value={p.no_show_after_minutes} onChange={(e) => setP({ ...p, no_show_after_minutes: num(e.target.value, 15) })} data-testid="policy-noshow" />
          </div>
        </div>
        {canalOficial && (
          <div className="space-y-1">
            <Label>Template aprovado para o lembrete (Meta e Zernio só enviam por template)</Label>
            <Select value={p.reminder_template_name ?? SEM_TEMPLATE} onValueChange={(v) => setP({ ...p, reminder_template_name: v === SEM_TEMPLATE ? null : v })}>
              <SelectTrigger aria-label="Template do lembrete"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_TEMPLATE}>Nenhum (lembrete não sai por WhatsApp)</SelectItem>
                {aprovados.map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="pol-rem-text">Texto do lembrete</Label>
          <Textarea id="pol-rem-text" rows={3} value={p.reminder_text} onChange={(e) => setP({ ...p, reminder_text: e.target.value })} data-testid="policy-reminder-text" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pol-ns-text">Texto quando não compareceu</Label>
          <Textarea id="pol-ns-text" rows={3} value={p.no_show_text} onChange={(e) => setP({ ...p, no_show_text: e.target.value })} />
        </div>
      </div>
      <Button onClick={gravar} disabled={salvar.isPending} data-testid="policy-save">{salvar.isPending ? "Salvando…" : "Salvar política"}</Button>
    </div>
  );
}
