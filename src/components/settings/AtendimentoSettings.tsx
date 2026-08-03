import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { History, MessageSquareText, Pencil, Plus, Smile, Timer, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useDeleteQuickReply, useImportQuickReplies, useQuickReplies, useSaveQuickReply,
  type QuickReply,
} from "@/hooks/useQuickReplies";
import { SLA_CHANNELS, useSaveSlaConfig, useSlaConfig } from "@/hooks/useSla";
import { NPS_CHANNELS, useNpsConfig, useSaveNpsConfig } from "@/hooks/useNps";
import { ImportHistoryDialog } from "@/components/settings/ImportHistoryDialog";
import { useConversationImports } from "@/hooks/useConversationImport";
import { formatDateTime } from "@/lib/format";
import { channelMeta } from "@/components/whatsapp/ChannelBadge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { parseCsv } from "@/lib/csv";

/**
 * SLA de atendimento (Parte 8 do Sprint 10A): limites de primeira resposta e
 * resolução, percentual de alerta e canais cobertos. O log em si é gravado por
 * triggers no banco; o inbox usa esta config para colorir os timers.
 */
function SlaSection() {
  const { data: config, isLoading } = useSlaConfig();
  const salvar = useSaveSlaConfig();

  const [form, setForm] = useState({
    is_active: true,
    first_response_minutes: "30",
    resolution_hours: "24",
    alert_threshold_percent: "80",
    active_channels: ["whatsapp"] as string[],
  });

  useEffect(() => {
    if (!config) return;
    setForm({
      is_active: config.is_active,
      first_response_minutes: String(config.first_response_minutes),
      resolution_hours: String(config.resolution_hours),
      alert_threshold_percent: String(config.alert_threshold_percent),
      active_channels: config.active_channels ?? ["whatsapp"],
    });
  }, [config]);

  const alternarCanal = (channel: string, marcado: boolean) => {
    setForm((f) => ({
      ...f,
      active_channels: marcado
        ? [...f.active_channels, channel]
        : f.active_channels.filter((c) => c !== channel),
    }));
  };

  const submeter = async () => {
    try {
      await salvar.mutateAsync({
        is_active: form.is_active,
        first_response_minutes: Math.max(1, Number(form.first_response_minutes) || 30),
        resolution_hours: Math.max(1, Number(form.resolution_hours) || 24),
        alert_threshold_percent: Math.min(100, Math.max(1, Number(form.alert_threshold_percent) || 80)),
        active_channels: form.active_channels,
      });
      toast.success("SLA salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o SLA.");
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
            <Timer className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            SLA de atendimento
          </h3>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Conversas aguardando resposta ganham um timer no inbox: verde dentro do prazo, amarelo
            no alerta, vermelho quando o limite estoura. As violações alimentam o relatório de SLA.
          </p>
        </div>
        <Switch
          aria-label="Ativar o SLA de atendimento"
          checked={form.is_active}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
          data-testid="sla-ativo"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="sla-first-response">Primeira resposta (minutos)</Label>
          <Input
            id="sla-first-response"
            type="number"
            min="1"
            value={form.first_response_minutes}
            onChange={(e) => setForm({ ...form, first_response_minutes: e.target.value })}
            data-testid="sla-first-response"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sla-resolution">Resolução (horas)</Label>
          <Input
            id="sla-resolution"
            type="number"
            min="1"
            value={form.resolution_hours}
            onChange={(e) => setForm({ ...form, resolution_hours: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sla-threshold">Alertar ao atingir (%)</Label>
          <Input
            id="sla-threshold"
            type="number"
            min="1"
            max="100"
            value={form.alert_threshold_percent}
            onChange={(e) => setForm({ ...form, alert_threshold_percent: e.target.value })}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Canais com SLA ativo
        </legend>
        <div className="flex flex-wrap gap-4">
          {SLA_CHANNELS.map((channel) => (
            <label key={channel} className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
              <Checkbox
                checked={form.active_channels.includes(channel)}
                onCheckedChange={(v) => alternarCanal(channel, v === true)}
                data-testid={`sla-channel-${channel}`}
              />
              {channelMeta(channel).label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button onClick={submeter} disabled={salvar.isPending} data-testid="sla-salvar">
          {salvar.isPending ? "Salvando…" : "Salvar SLA"}
        </Button>
      </div>
    </div>
  );
}

/**
 * NPS automático ao encerrar conversa (Parte 5 do Sprint 10B): pergunta,
 * agradecimento, delay e canais. O envio é o nps-dispatcher (cron a cada
 * minuto); a resposta 0–10 é capturada por trigger no banco.
 */
function NpsSection() {
  const { data: config, isLoading } = useNpsConfig();
  const salvar = useSaveNpsConfig();

  const [form, setForm] = useState({
    is_active: false,
    message: "De 0 a 10, qual a chance de você recomendar {{company}} para um amigo?",
    thank_you_message: "Obrigado pelo seu feedback!",
    delay_minutes: "5",
    active_channels: ["whatsapp"] as string[],
  });

  useEffect(() => {
    if (!config) return;
    setForm({
      is_active: config.is_active,
      message: config.message,
      thank_you_message: config.thank_you_message,
      delay_minutes: String(config.delay_minutes),
      active_channels: config.active_channels ?? ["whatsapp"],
    });
  }, [config]);

  const alternarCanal = (channel: string, marcado: boolean) => {
    setForm((f) => ({
      ...f,
      active_channels: marcado
        ? [...f.active_channels, channel]
        : f.active_channels.filter((c) => c !== channel),
    }));
  };

  const submeter = async () => {
    if (!form.message.trim()) {
      toast.error("Escreva a mensagem da pesquisa.");
      return;
    }
    try {
      await salvar.mutateAsync({
        is_active: form.is_active,
        message: form.message.trim(),
        thank_you_message: form.thank_you_message.trim() || "Obrigado pelo seu feedback!",
        delay_minutes: Math.max(1, Number(form.delay_minutes) || 5),
        active_channels: form.active_channels,
      });
      toast.success("NPS salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o NPS.");
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
            <Smile className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Pesquisa de satisfação (NPS)
          </h3>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Ao encerrar uma conversa, o contato recebe a pergunta de 0 a 10 após o tempo de espera.
            A resposta numérica é registrada sozinha e alimenta o relatório de NPS. Variável:{" "}
            {"{{company}}"}.
          </p>
        </div>
        <Switch
          aria-label="Ativar o NPS automático ao encerrar conversa"
          checked={form.is_active}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
          data-testid="nps-ativo"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nps-message">Mensagem de NPS</Label>
        <Textarea
          id="nps-message"
          rows={2}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          data-testid="nps-message"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nps-delay">Aguardar após encerrar (minutos)</Label>
          <Input
            id="nps-delay"
            type="number"
            min="1"
            className="w-32"
            value={form.delay_minutes}
            onChange={(e) => setForm({ ...form, delay_minutes: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nps-thanks">Mensagem de agradecimento</Label>
          <Input
            id="nps-thanks"
            value={form.thank_you_message}
            onChange={(e) => setForm({ ...form, thank_you_message: e.target.value })}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Canais onde o NPS é enviado
        </legend>
        <div className="flex flex-wrap gap-4">
          {NPS_CHANNELS.map((channel) => (
            <label key={channel} className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
              <Checkbox
                checked={form.active_channels.includes(channel)}
                onCheckedChange={(v) => alternarCanal(channel, v === true)}
                data-testid={`nps-channel-${channel}`}
              />
              {channelMeta(channel).label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button onClick={submeter} disabled={salvar.isPending} data-testid="nps-salvar">
          {salvar.isPending ? "Salvando…" : "Salvar NPS"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Importar histórico de conversas (Parte 6 do Sprint 10B): botão que abre o
 * wizard e a lista das últimas importações com status e totais.
 */
function ImportHistorySection() {
  const { data: imports } = useConversationImports();
  const [open, setOpen] = useState(false);

  const STATUS_LABEL: Record<string, string> = {
    pending: "pendente",
    processing: "processando",
    completed: "concluída",
    failed: "falhou",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
            <History className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Importar histórico
          </h3>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Traga conversas do Chatwoot, Zendesk, Intercom ou de um CSV. Elas entram encerradas,
            visíveis na ficha do contato e no inbox — sem acionar IA nem automações.
          </p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)} data-testid="import-history-abrir">
          <Upload className="h-4 w-4" strokeWidth={1.5} />
          Importar histórico
        </Button>
      </div>

      {(imports ?? []).length > 0 && (
        <ul className="space-y-1.5">
          {(imports ?? []).map((imp) => (
            <li key={imp.id} className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
              <span className="font-medium">{imp.file_name ?? imp.source_platform}</span>
              <span style={{ color: "var(--via-text-muted)" }}>
                {STATUS_LABEL[imp.status] ?? imp.status}
                {imp.status === "completed" ? ` · ${imp.total_conversations} conversas, ${imp.total_messages} mensagens` : ""}
                {imp.error_msg ? ` · ${imp.error_msg}` : ""}
                {" · "}{formatDateTime(imp.started_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ImportHistoryDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * Configurações > Atendimento — SLA (Parte 8 do Sprint 10A), NPS (Parte 5 do
 * Sprint 10B) e Respostas rápidas (Parte 2 do 10A).
 *
 * As respostas são da organização inteira: qualquer agente usa, qualquer um
 * cadastra. Variáveis suportadas na mensagem: {{contact.first_name}},
 * {{contact.last_name}}, {{contact.name}}.
 */
export default function AtendimentoSettings() {
  const { data: respostas, isLoading } = useQuickReplies();
  const salvar = useSaveQuickReply();
  const excluir = useDeleteQuickReply();
  const importar = useImportQuickReplies();

  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<QuickReply | null>(null);
  const [form, setForm] = useState({ shortcut: "", title: "", message: "", category: "" });
  const [apagando, setApagando] = useState<QuickReply | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const abrirNova = () => {
    setEditando(null);
    setForm({ shortcut: "", title: "", message: "", category: "" });
    setFormOpen(true);
  };

  const abrirEdicao = (r: QuickReply) => {
    setEditando(r);
    setForm({ shortcut: r.shortcut, title: r.title, message: r.message, category: r.category ?? "" });
    setFormOpen(true);
  };

  const submeter = async () => {
    if (!form.shortcut.trim() || !form.title.trim() || !form.message.trim()) {
      toast.error("Atalho, título e mensagem são obrigatórios.");
      return;
    }
    try {
      await salvar.mutateAsync({
        id: editando?.id,
        shortcut: form.shortcut,
        title: form.title.trim(),
        message: form.message,
        category: form.category.trim() || null,
        is_active: editando?.is_active ?? true,
      });
      setFormOpen(false);
      toast.success(editando ? "Resposta atualizada." : "Resposta criada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a resposta.");
    }
  };

  const confirmarExclusao = async () => {
    if (!apagando) return;
    try {
      await excluir.mutateAsync(apagando.id);
      toast.success("Resposta excluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setApagando(null);
    }
  };

  const importarCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { headers, rows } = parseCsv(await file.text());
      const idx = (nome: string) => headers.findIndex((h) => h.trim().toLowerCase() === nome);
      const iShortcut = idx("shortcut");
      const iTitle = idx("title");
      const iMessage = idx("message");
      const iCategory = idx("category");
      if (iShortcut < 0 || iTitle < 0 || iMessage < 0) {
        toast.error("O CSV precisa das colunas shortcut, title e message (category é opcional).");
        return;
      }
      const { importadas, ignoradas } = await importar.mutateAsync(
        rows.map((r) => ({
          shortcut: r[iShortcut] ?? "",
          title: r[iTitle] ?? "",
          message: r[iMessage] ?? "",
          category: iCategory >= 0 ? r[iCategory] : null,
        })),
      );
      toast.success(`${importadas} resposta(s) importada(s)${ignoradas ? ` · ${ignoradas} linha(s) incompleta(s) ignorada(s)` : ""}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível importar o CSV.");
    }
  };

  return (
    <div className="space-y-6">
      <SlaSection />

      <Separator />

      <NpsSection />

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
            Respostas rápidas
          </h3>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            O agente digita <code>/</code> no campo de mensagem do inbox e escolhe da lista.
            Variáveis: {"{{contact.first_name}}"}, {"{{contact.last_name}}"}, {"{{contact.name}}"}.
          </p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importarCsv} />
          <Button variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={importar.isPending}>
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            Importar CSV
          </Button>
          <Button className="gap-1.5" onClick={abrirNova} data-testid="quick-reply-nova">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova resposta
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (respostas ?? []).length === 0 ? (
        <div className="via-card p-8 text-center">
          <MessageSquareText className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Nenhuma resposta rápida ainda
          </p>
          <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
            Cadastre as mensagens que o time digita todo dia — proposta, preço, link do site — e
            elas ficam a um <code>/</code> de distância no inbox.
          </p>
          <div className="flex justify-center">
            <Button onClick={abrirNova} className="gap-1.5">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Criar a primeira
            </Button>
          </div>
        </div>
      ) : (
        <div className="via-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Atalho</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(respostas ?? []).map((r) => (
                <TableRow key={r.id} data-testid="quick-reply-row">
                  <TableCell className="font-medium">/{r.shortcut}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell className="max-w-64">
                    <span className="line-clamp-1" style={{ color: "var(--via-text-body)" }}>{r.message}</span>
                  </TableCell>
                  <TableCell>{r.category ?? "—"}</TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Ativar a resposta /${r.shortcut}`}
                      checked={r.is_active}
                      onCheckedChange={(v) =>
                        salvar.mutate({ id: r.id, shortcut: r.shortcut, title: r.title, message: r.message, category: r.category, is_active: v })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Editar /${r.shortcut}`} onClick={() => abrirEdicao(r)}>
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Excluir /${r.shortcut}`} onClick={() => setApagando(r)}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? `Editar /${editando.shortcut}` : "Nova resposta rápida"}</DialogTitle>
            <DialogDescription>
              O atalho é o que o agente digita depois da barra. A mensagem aceita variáveis do
              contato, substituídas na hora do uso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="qr-shortcut">Atalho</Label>
                <Input
                  id="qr-shortcut"
                  placeholder="proposta"
                  value={form.shortcut}
                  onChange={(e) => setForm({ ...form, shortcut: e.target.value })}
                  data-testid="quick-reply-shortcut"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-category">Categoria (opcional)</Label>
                <Input
                  id="qr-category"
                  placeholder="Vendas"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qr-title">Título</Label>
              <Input
                id="qr-title"
                placeholder="Enviar proposta"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                data-testid="quick-reply-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qr-message">Mensagem</Label>
              <Textarea
                id="qr-message"
                rows={4}
                placeholder="Olá {{contact.first_name}}! Segue nossa proposta…"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                data-testid="quick-reply-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={submeter} disabled={salvar.isPending} data-testid="quick-reply-salvar">
              {editando ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!apagando} onOpenChange={(open) => !open && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir /{apagando?.shortcut}?</AlertDialogTitle>
            <AlertDialogDescription>
              A resposta some da lista do inbox para todos os agentes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
