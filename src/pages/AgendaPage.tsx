import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Video } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { useAuth } from "@/hooks/useAuth";
import { useOrgMemberNames, useOrgMembers } from "@/hooks/useOrgMembers";
import {
  APPOINTMENT_SOURCE_LABEL, APPOINTMENT_STATUS_LABEL, useAppointments, useContactOptions, useSaveAppointment, useSetAppointmentStatus,
  type Appointment, type AppointmentStatus,
} from "@/hooks/useAgenda";

const DIA_MS = 86_400_000;
const SEM_CONTATO = "__none__";
const SEM_DONO = "__none__";

function inicioDaSemana(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function chaveDia(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function tituloDia(chave: string): string {
  const [a, m, d] = chave.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date(a, m - 1, d));
}
function hora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function paraInputLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const COR_STATUS: Record<AppointmentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  scheduled: "secondary", confirmed: "default", completed: "outline", no_show: "destructive", cancelled: "outline",
};

/** Agenda: reuniões da semana (IA, manual e Cal.com), criar, remarcar, confirmar, cancelar e marcar presença. */
export default function AgendaPage() {
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()));
  const fim = useMemo(() => new Date(semana.getTime() + 7 * DIA_MS), [semana]);
  const { data: reunioes, isLoading, error } = useAppointments(semana.toISOString(), fim.toISOString());
  const nomes = useOrgMemberNames();
  const mudar = useSetAppointmentStatus();
  const [dialogo, setDialogo] = useState<{ aberto: boolean; editando?: Appointment | null }>({ aberto: false });

  const porDia = useMemo(() => {
    const mapa = new Map<string, Appointment[]>();
    for (const r of reunioes ?? []) {
      const k = chaveDia(r.starts_at);
      mapa.set(k, [...(mapa.get(k) ?? []), r]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [reunioes]);

  const status = async (r: Appointment, novo: AppointmentStatus) => {
    try {
      await mudar.mutateAsync({ id: r.id, status: novo });
      toast.success(`Reunião marcada como ${APPOINTMENT_STATUS_LABEL[novo].toLowerCase()}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar.");
    }
  };

  const rotulo = `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(semana)} a ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(fim.getTime() - DIA_MS))}`;

  return (
    <AppShell>
      <div className="space-y-4" data-testid="agenda-page">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>Agenda</h1>
        </div>
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Reuniões marcadas pela IA, pela equipe e pelo Cal.com, com lembrete e controle de presença.</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSemana(new Date(semana.getTime() - 7 * DIA_MS))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" strokeWidth={1.5} /></Button>
            <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }} data-testid="agenda-week">{rotulo}</span>
            <Button size="sm" variant="ghost" onClick={() => setSemana(new Date(semana.getTime() + 7 * DIA_MS))} aria-label="Próxima semana"><ChevronRight className="h-4 w-4" strokeWidth={1.5} /></Button>
            <Button size="sm" variant="outline" onClick={() => setSemana(inicioDaSemana(new Date()))}>Hoje</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" asChild><Link to="/settings/agenda">Configurar agenda</Link></Button>
            <Button size="sm" onClick={() => setDialogo({ aberto: true, editando: null })} data-testid="agenda-new"><Plus className="mr-1 h-4 w-4" strokeWidth={1.5} /> Nova reunião</Button>
          </div>
        </div>

        {error ? <ErrorState title="Não foi possível carregar a agenda" error={error} /> : isLoading ? <Skeleton className="h-40 w-full" /> : porDia.length === 0 ? (
          <div className="via-card flex flex-col items-center gap-2 p-10 text-center">
            <CalendarDays className="h-8 w-8" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhuma reunião nesta semana.</p>
          </div>
        ) : porDia.map(([dia, lista]) => (
          <section key={dia} className="via-card p-4" data-testid={`agenda-dia-${dia}`}>
            <h2 className="mb-3 text-sm font-medium capitalize" style={{ color: "var(--via-text-primary)" }}>{tituloDia(dia)}</h2>
            <ul className="divide-y" style={{ borderColor: "var(--via-border)" }}>
              {lista.map((r) => {
                const st = r.status as AppointmentStatus;
                const viva = st === "scheduled" || st === "confirmed";
                const contato = r.contacts ? [r.contacts.first_name, r.contacts.last_name].filter(Boolean).join(" ") : null;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`agenda-item-${r.id}`}>
                    <span className="w-24 text-sm tabular-nums" style={{ color: "var(--via-text-primary)" }}>{hora(r.starts_at)} às {hora(r.ends_at)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{r.title}</p>
                      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                        {contato ? <Link to={`/contacts/${r.contact_id}`} className="underline-offset-2 hover:underline">{contato}</Link> : "Sem contato"}
                        {r.owner_id ? ` · ${nomes.get(r.owner_id) ?? "responsável"}` : ""} · marcada {APPOINTMENT_SOURCE_LABEL[r.source] ?? r.source}
                        {r.reminder_sent_at ? " · lembrete enviado" : ""}{r.calendar_sync_status === "error" ? ` · calendário: ${r.calendar_sync_error}` : ""}
                      </p>
                    </div>
                    {r.meeting_url && <a href={r.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--via-text-body)" }}><Video className="mr-1 inline h-4 w-4" strokeWidth={1.5} />Entrar</a>}
                    <Badge variant={COR_STATUS[st]}>{APPOINTMENT_STATUS_LABEL[st]}</Badge>
                    {viva && (
                      <div className="flex flex-wrap gap-1">
                        {st === "scheduled" && <Button size="sm" variant="ghost" onClick={() => status(r, "confirmed")}>Confirmar</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setDialogo({ aberto: true, editando: r })}>Remarcar</Button>
                        <Button size="sm" variant="ghost" onClick={() => status(r, "completed")}>Realizada</Button>
                        <Button size="sm" variant="ghost" onClick={() => status(r, "no_show")}>Não veio</Button>
                        <Button size="sm" variant="ghost" onClick={() => status(r, "cancelled")} data-testid="agenda-cancel">Cancelar</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <ReuniaoDialog aberto={dialogo.aberto} editando={dialogo.editando ?? null} aoFechar={() => setDialogo({ aberto: false })} />
    </AppShell>
  );
}

function ReuniaoDialog({ aberto, editando, aoFechar }: { aberto: boolean; editando: Appointment | null; aoFechar: () => void }) {
  const { user } = useAuth();
  const salvar = useSaveAppointment();
  const { data: membros } = useOrgMembers();
  const [busca, setBusca] = useState("");
  const { data: contatos } = useContactOptions(busca);
  const [form, setForm] = useState(() => ({
    title: editando?.title ?? "", contact_id: editando?.contact_id ?? null, owner_id: editando?.owner_id ?? user?.id ?? null,
    starts_at: paraInputLocal(editando ? new Date(editando.starts_at) : new Date(Date.now() + 60 * 60_000)),
    duration: editando ? Math.round((new Date(editando.ends_at).getTime() - new Date(editando.starts_at).getTime()) / 60_000) : 30,
    description: editando?.description ?? "", location: editando?.location ?? "",
  }));

  const gravar = async () => {
    try {
      await salvar.mutateAsync({
        id: editando?.id, title: form.title, contact_id: form.contact_id, owner_id: form.owner_id, starts_at: new Date(form.starts_at).toISOString(),
        duration_minutes: form.duration, description: form.description, location: form.location, deal_id: editando?.deal_id ?? null,
      });
      toast.success(editando ? "Reunião remarcada." : "Reunião marcada.");
      aoFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent data-testid="agenda-dialog">
        <DialogHeader>
          <DialogTitle>{editando ? "Remarcar reunião" : "Nova reunião"}</DialogTitle>
          <DialogDescription>{editando ? "Escolha o novo dia e horário." : "Defina título, início, duração e contato."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="ag-titulo">Título</Label>
            <Input id="ag-titulo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="agenda-title" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ag-inicio">Início</Label>
              <Input id="ag-inicio" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} data-testid="agenda-start" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ag-dur">Duração (min)</Label>
              <Input id="ag-dur" type="number" min={15} max={240} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) || 30 })} />
            </div>
          </div>
          {!editando && (
            <div className="space-y-1">
              <Label>Contato</Label>
              <Input placeholder="Buscar pelo primeiro nome" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="agenda-contact-search" />
              <Select value={form.contact_id ?? SEM_CONTATO} onValueChange={(v) => setForm({ ...form, contact_id: v === SEM_CONTATO ? null : v })}>
                <SelectTrigger aria-label="Contato" data-testid="agenda-contact"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CONTATO}>Sem contato</SelectItem>
                  {(contatos ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ")}{c.email ? ` · ${c.email}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Responsável</Label>
            <Select value={form.owner_id ?? SEM_DONO} onValueChange={(v) => setForm({ ...form, owner_id: v === SEM_DONO ? null : v })}>
              <SelectTrigger aria-label="Responsável"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_DONO}>Sem responsável</SelectItem>
                {(membros ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ag-local">Local ou link (opcional)</Label>
            <Input id="ag-local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ag-desc">Descrição (opcional)</Label>
            <Textarea id="ag-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
            <Button onClick={gravar} disabled={salvar.isPending || !form.title.trim()} data-testid="agenda-save">{editando ? "Remarcar" : "Marcar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
