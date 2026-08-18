import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import { DesconectarIntegracao } from "@/components/settings/DesconectarIntegracao";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgId } from "@/hooks/useOrgId";
import { CALCOM_DEFAULTS, useCalcomConfig, useSaveCalcomConfig, type CalcomConfig } from "@/hooks/useCalcom";

/**
 * Configurações > Integrações > Agendamento (Cal.com) — Parte 11 do Sprint 10A.
 *
 * O link é oferecido pela IA nas conversas; o webhook (colado no Cal.com)
 * transforma cada agendamento confirmado em atividade no CRM.
 */
export default function CalcomSettings() {
  const orgId = useOrgId();
  const { data, isLoading } = useCalcomConfig();
  const salvar = useSaveCalcomConfig();

  const [form, setForm] = useState<CalcomConfig>(CALCOM_DEFAULTS);

  useEffect(() => {
    if (data) setForm(data.config);
  }, [data]);

  // O ?org= identifica a organização: a URL da function é uma só para todas.
  const webhookUrl = orgId
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calcom-webhook?org=${orgId}`
    : "";

  const testarLink = () => {
    const link = form.scheduling_link.trim();
    if (!link) {
      toast.error("Informe o link de agendamento primeiro.");
      return;
    }
    window.open(link.startsWith("http") ? link : `https://${link}`, "_blank", "noopener");
  };

  const copiarWebhook = async () => {
    // Clipboard pode ser negado (permissão, iframe) — sem o catch o clique
    // vira exceção não tratada.
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("URL do webhook copiada.");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie à mão.");
    }
  };

  const submeter = async () => {
    try {
      await salvar.mutateAsync(form);
      toast.success("Integração de agendamento salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const removerCalcom = async () => {
    try {
      // Só o link some: as preferências de "o que fazer ao confirmar" ficam
      // como estavam, para reconectar não exigir reconfigurar tudo.
      await salvar.mutateAsync({ ...form, scheduling_link: "" });
      setForm((f) => ({ ...f, scheduling_link: "" }));
      toast.success("Integração removida. A IA não oferece mais o link de reunião.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover.");
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      {/* Mesma barra de ajuda das outras integrações: o link sozinho não basta,
          é o webhook que faz o agendamento virar atividade no CRM. */}
      <ApiKeyTutorialDialog service="calcom" />

      <div className="space-y-2">
        <Label htmlFor="calcom-link">Link de agendamento</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="calcom-link"
            className="min-w-64 flex-1"
            placeholder="https://cal.com/seu-usuario/reuniao-30min"
            value={form.scheduling_link}
            onChange={(e) => setForm({ ...form, scheduling_link: e.target.value })}
            data-testid="calcom-link"
          />
          <Button variant="outline" className="gap-1.5" onClick={testarLink}>
            <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
            Testar link
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="calcom-webhook">Webhook de confirmação (cole no Cal.com)</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="calcom-webhook" readOnly className="min-w-64 flex-1 text-xs" value={webhookUrl} />
          <Button variant="outline" className="gap-1.5" onClick={copiarWebhook}>
            <Copy className="h-4 w-4" strokeWidth={1.5} />
            Copiar
          </Button>
        </div>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          No Cal.com: Settings → Developer → Webhooks → New, evento "Booking created".
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Quando um agendamento for confirmado
        </legend>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
          <Checkbox
            checked={form.create_activity}
            onCheckedChange={(v) => setForm({ ...form, create_activity: v === true })}
            data-testid="calcom-create-activity"
          />
          Criar atividade no CRM (tipo: Reunião)
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
          <Checkbox
            checked={form.link_deal}
            onCheckedChange={(v) => setForm({ ...form, link_deal: v === true })}
          />
          Vincular ao negócio ativo do contato
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
          <Checkbox
            checked={form.notify_agent}
            onCheckedChange={(v) => setForm({ ...form, notify_agent: v === true })}
          />
          Notificar o agente responsável
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {form.scheduling_link.trim() ? (
          <DesconectarIntegracao
            titulo="Remover o agendamento pelo Cal.com?"
            consequencia="A IA deixa de oferecer o link de reunião nas conversas e novos agendamentos não viram atividade no CRM. As reuniões já registradas continuam no histórico, e o webhook segue no Cal.com — para voltar, basta salvar o link de novo."
            rotulo="Remover integração"
            onConfirmar={removerCalcom}
            disabled={salvar.isPending}
            testId="desconectar-calcom"
          />
        ) : <span />}
        <Button onClick={submeter} disabled={salvar.isPending} data-testid="calcom-salvar">
          {salvar.isPending ? "Salvando…" : "Salvar agendamento"}
        </Button>
      </div>
    </div>
  );
}
