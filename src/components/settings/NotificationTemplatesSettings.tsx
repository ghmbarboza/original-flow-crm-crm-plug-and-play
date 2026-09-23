import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import {
  NOTIFICATION_EVENTS, renderizarModelo, useNotificationTemplates, useResetNotificationTemplate,
  useSaveNotificationTemplate, type NotificationTemplate,
} from "@/hooks/useNotificationTemplates";

const VARIAVEIS = ["{{title}}", "{{body}}", "{{user.first_name}}", "{{link}}"];
const EXEMPLO = {
  title: "Negócio atribuído a você",
  body: 'O negócio "Proposta Empresa X" agora é seu.',
  "user.first_name": "Ana",
  link: "https://seu-crm.com.br/deals/123",
};

/**
 * Configurações > Notificações > Modelos: o texto de cada evento no app, no
 * e-mail e no WhatsApp. {{title}} e {{body}} são o que o CRM monta para o
 * evento; o modelo decide como isso aparece em cada canal.
 */
export default function NotificationTemplatesSettings() {
  const { data: modelos, isLoading, error } = useNotificationTemplates();
  const salvar = useSaveNotificationTemplate();
  const restaurar = useResetNotificationTemplate();
  const [evento, setEvento] = useState(NOTIFICATION_EVENTS[0].type);
  const [form, setForm] = useState<NotificationTemplate | null>(null);

  const atual = (modelos ?? []).find((m) => m.event_type === evento) ?? null;
  useEffect(() => {
    setForm(atual ? { ...atual } : null);
  }, [atual]);

  const gravar = async () => {
    if (!form) return;
    try {
      await salvar.mutateAsync(form);
      toast.success("Modelo salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const voltarPadrao = async () => {
    try {
      await restaurar.mutateAsync(evento);
      toast.success("Modelo restaurado para o padrão.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível restaurar.");
    }
  };

  if (error) return <ErrorState title="Não foi possível carregar os modelos" error={error} />;
  if (isLoading || !form) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const meta = NOTIFICATION_EVENTS.find((e) => e.type === evento)!;

  return (
    <div className="space-y-4" data-testid="notification-templates">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label>Evento</Label>
          <Select value={evento} onValueChange={setEvento}>
            <SelectTrigger className="w-80" aria-label="Evento do modelo" data-testid="template-event">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTIFICATION_EVENTS.map((e) => (
                <SelectItem key={e.type} value={e.type}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          {meta.description} {form.personalizado ? "Modelo personalizado." : "Usando o padrão."}
        </p>
      </div>

      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
        Variáveis: {VARIAVEIS.join(", ")}. "title" e "body" são o texto que o CRM monta para o evento; "link" abre o item no CRM.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="via-card space-y-3 p-4">
          <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>No app</h3>
          <div className="space-y-2">
            <Label htmlFor="tpl-title" className="text-xs font-normal">Título</Label>
            <Input id="tpl-title" value={form.title_template} onChange={(e) => setForm({ ...form, title_template: e.target.value })} data-testid="template-title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body" className="text-xs font-normal">Texto</Label>
            <Textarea id="tpl-body" rows={2} value={form.body_template} onChange={(e) => setForm({ ...form, body_template: e.target.value })} />
          </div>
          <h3 className="pt-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>WhatsApp</h3>
          <div className="space-y-2">
            <Label htmlFor="tpl-wpp" className="text-xs font-normal">Mensagem (Evolution)</Label>
            <Textarea id="tpl-wpp" rows={3} value={form.whatsapp_text} onChange={(e) => setForm({ ...form, whatsapp_text: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-wpp-template" className="text-xs font-normal">Template aprovado (Meta e Zernio), com uma variável que recebe a mensagem</Label>
            <Input id="tpl-wpp-template" value={form.whatsapp_template_name ?? ""} onChange={(e) => setForm({ ...form, whatsapp_template_name: e.target.value })} placeholder="aviso_crm" />
          </div>
        </div>

        <div className="via-card space-y-3 p-4">
          <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>E-mail</h3>
          <div className="space-y-2">
            <Label htmlFor="tpl-subject" className="text-xs font-normal">Assunto</Label>
            <Input id="tpl-subject" value={form.email_subject} onChange={(e) => setForm({ ...form, email_subject: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-html" className="text-xs font-normal">Corpo (HTML simples)</Label>
            <Textarea id="tpl-html" rows={6} value={form.email_html} onChange={(e) => setForm({ ...form, email_html: e.target.value })} className="font-mono text-xs" />
          </div>
        </div>
      </div>

      <div className="via-card space-y-2 p-4" data-testid="template-preview">
        <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Prévia com dados de exemplo</h3>
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          <strong>{renderizarModelo(form.title_template, EXEMPLO)}</strong>
          <br />{renderizarModelo(form.body_template, EXEMPLO)}
        </p>
        <p className="whitespace-pre-wrap text-xs" style={{ color: "var(--via-text-muted)" }}>
          WhatsApp: {renderizarModelo(form.whatsapp_text, EXEMPLO)}
        </p>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          E-mail: {renderizarModelo(form.email_subject, EXEMPLO)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={gravar} disabled={salvar.isPending} data-testid="template-save">
          {salvar.isPending ? "Salvando…" : "Salvar modelo"}
        </Button>
        <Button variant="outline" onClick={voltarPadrao} disabled={!form.personalizado || restaurar.isPending} data-testid="template-reset">
          <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
          Restaurar padrão
        </Button>
      </div>
    </div>
  );
}
