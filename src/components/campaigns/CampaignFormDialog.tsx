import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { channelMeta } from "@/components/whatsapp/ChannelBadge";
import { useTags } from "@/hooks/useTags";
import { useAudiencePreview, useCreateCampaign } from "@/hooks/useCampaigns";
import { useMessageTemplates } from "@/hooks/useMessageTemplates";
import {
  CHANNEL_CHAR_LIMIT, PROVIDER_LABEL, availableChannels, providersForChannel,
  requiresTemplate, usableProviders,
  type CampaignChannel, type CampaignProvider,
} from "@/lib/campaign-channels";

const ALL = "all";
const TAG = "tag";
const NO_TEMPLATE = "__none__";

const STEPS = ["Canal", "Público", "Mensagem", "Agendamento", "Revisão"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provedores realmente configurados na org. */
  activeProviders: { meta: boolean; zernio: boolean };
}

export function CampaignFormDialog({ open, onOpenChange, activeProviders }: Props) {
  const { data: tags } = useTags();
  const createCampaign = useCreateCampaign();

  const channels = useMemo(() => availableChannels(activeProviders), [activeProviders]);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    channel: (channels[0] ?? "whatsapp") as CampaignChannel,
    provider: "meta_official" as CampaignProvider,
    name: "",
    message: "",
    audience: ALL as "all" | "tag",
    tagId: "",
    scheduled: "",
    templateName: NO_TEMPLATE,
  });

  // Templates só existem em WhatsApp; buscar em outro canal seria chamada à toa.
  const templatesEnabled = open && form.channel === "whatsapp";
  const { data: templateData, isLoading: loadingTemplates } = useMessageTemplates(templatesEnabled);
  const approved = (templateData?.templates ?? []).filter((t) => t.status === "APPROVED");

  const providerOptions = useMemo(
    () => providersForChannel(form.channel, activeProviders),
    [form.channel, activeProviders],
  );

  const audienceEnabled = open && step >= 1;
  const { data: audienceCount, isLoading: loadingAudience } = useAudiencePreview(
    form.channel,
    form.audience,
    form.audience === TAG ? form.tagId || null : null,
    audienceEnabled && (form.audience === ALL || !!form.tagId),
  );

  useEffect(() => {
    if (!open) return;
    const first = availableChannels(activeProviders)[0] ?? "whatsapp";
    setStep(0);
    setForm({
      channel: first as CampaignChannel,
      provider: (usableProviders(first, activeProviders)[0] ?? "meta_official") as CampaignProvider,
      name: "", message: "", audience: ALL, tagId: "", scheduled: "",
      templateName: NO_TEMPLATE,
    });
  }, [open, activeProviders]);

  /** Trocar de canal pode invalidar o provedor escolhido — reassenta no primeiro válido. */
  const changeChannel = (channel: CampaignChannel) => {
    const usable = usableProviders(channel, activeProviders);
    setForm((f) => ({
      ...f,
      channel,
      provider: (usable.includes(f.provider) ? f.provider : usable[0] ?? "meta_official") as CampaignProvider,
      templateName: NO_TEMPLATE,
    }));
  };

  const selectedTemplate = approved.find((t) => t.name === form.templateName) ?? null;
  const templateRequired = requiresTemplate(form.channel, form.provider);
  const paramCount = (form.message.match(/\{\{(\w+)\}\}/g) ?? []).length;
  const charLimit = CHANNEL_CHAR_LIMIT[form.channel];
  const overLimit = !!charLimit && form.message.length > charLimit;

  /** Motivo de o passo atual não poder avançar, ou null se está tudo certo. */
  const blockedReason = (): string | null => {
    if (step === 0) {
      if (!form.channel) return "Escolha o canal da campanha.";
      if (!usableProviders(form.channel, activeProviders).includes(form.provider)) {
        return "Escolha um provedor disponível para este canal.";
      }
    }
    if (step === 1) {
      if (form.audience === TAG && !form.tagId) return "Escolha a tag do público.";
      if (audienceCount === 0) return "Nenhum contato alcançável neste canal para o público escolhido.";
    }
    if (step === 2) {
      if (!form.name.trim()) return "Informe o nome da campanha.";
      if (!form.message.trim()) return "Escreva a mensagem.";
      if (overLimit) return `A mensagem passa do limite de ${charLimit} caracteres do canal.`;
      if (templateRequired && !selectedTemplate) {
        return "Campanhas de WhatsApp pelo Zernio exigem um template aprovado.";
      }
      if (selectedTemplate && selectedTemplate.param_count !== paramCount) {
        return `O template espera ${selectedTemplate.param_count} variável(is), mas a mensagem tem ${paramCount}.`;
      }
    }
    return null;
  };

  const blocked = blockedReason();
  const isLast = step === STEPS.length - 1;

  const submit = async () => {
    try {
      const { total } = await createCampaign.mutateAsync({
        name: form.name.trim(),
        message_template: form.message.trim(),
        audience_type: form.audience,
        source_tag_id: form.audience === TAG ? form.tagId : null,
        scheduled_at: form.scheduled ? new Date(form.scheduled).toISOString() : null,
        channel: form.channel,
        provider: form.provider,
        template_name: selectedTemplate?.name ?? null,
        template_language: selectedTemplate?.language ?? null,
      });
      toast.success(`Campanha criada com ${total} destinatário(s).`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a campanha.");
    }
  };

  if (channels.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nenhum canal disponível</DialogTitle>
            <DialogDescription>
              Configure a API Oficial (Meta) ou o Zernio em Configurações &gt; Canais para
              disparar campanhas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Passo {step + 1} de {STEPS.length} — {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Trilha de passos */}
        <div className="flex items-center gap-1">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: i <= step ? "var(--via-navy)" : "var(--via-surface)" }}
              title={label}
            />
          ))}
        </div>

        <div className="via-scroll max-h-[55vh] space-y-4 py-2">
          {/* ---- Passo 1: canal e provedor ---- */}
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="camp-channel">Canal</Label>
                <Select value={form.channel} onValueChange={(v) => changeChannel(v as CampaignChannel)}>
                  <SelectTrigger id="camp-channel"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch} value={ch}>{channelMeta(ch).label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Enviar via</Label>
                {providerOptions.map((opt) => {
                  const disabled = !!opt.unavailableReason;
                  const active = form.provider === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setForm({ ...form, provider: opt.value })}
                      className="flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors disabled:opacity-50"
                      style={{
                        borderColor: active ? "var(--via-navy)" : "var(--via-border)",
                        background: active ? "var(--via-surface)" : "transparent",
                      }}
                    >
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                        style={{ borderColor: active ? "var(--via-navy)" : "var(--via-border)" }}
                      >
                        {active && <Check className="h-3 w-3" strokeWidth={2.5} style={{ color: "var(--via-navy)" }} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                          {opt.label}
                        </span>
                        {opt.unavailableReason && (
                          <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>
                            {opt.unavailableReason}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ---- Passo 2: público ---- */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="camp-audience">Público</Label>
                <Select
                  value={form.audience}
                  onValueChange={(v) => setForm({ ...form, audience: v as "all" | "tag" })}
                >
                  <SelectTrigger id="camp-audience"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      Todos alcançáveis no {channelMeta(form.channel).label}
                    </SelectItem>
                    <SelectItem value={TAG}>Por tag</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.audience === TAG && (
                <div className="space-y-2">
                  <Label htmlFor="camp-tag">Tag</Label>
                  <Select value={form.tagId} onValueChange={(v) => setForm({ ...form, tagId: v })}>
                    <SelectTrigger id="camp-tag">
                      <SelectValue placeholder="Escolha a tag" />
                    </SelectTrigger>
                    <SelectContent>
                      {(tags ?? []).map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="rounded-lg p-3" style={{ background: "var(--via-surface)" }}>
                <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
                  {loadingAudience
                    ? "Calculando alcance…"
                    : audienceCount === undefined
                      ? "Escolha o público para ver o alcance."
                      : `${audienceCount} contato(s) alcançável(is) neste canal.`}
                </p>
                {form.channel !== "whatsapp" && (
                  <p className="mt-1 text-xs" style={{ color: "var(--via-text-muted)" }}>
                    Conta apenas contatos com identificador do {channelMeta(form.channel).label}{" "}
                    registrado — normalmente quem já conversou com você por lá.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ---- Passo 3: mensagem ---- */}
          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="camp-name">Nome da campanha</Label>
                <Input
                  id="camp-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </div>

              {form.channel === "whatsapp" && (
                <div className="space-y-2">
                  <Label htmlFor="camp-template">
                    Template{templateRequired ? "" : " (opcional)"}
                  </Label>
                  <Select
                    value={form.templateName}
                    onValueChange={(v) => setForm({ ...form, templateName: v })}
                    disabled={loadingTemplates}
                  >
                    <SelectTrigger id="camp-template">
                      <SelectValue placeholder={loadingTemplates ? "Carregando…" : "Escolha o template"} />
                    </SelectTrigger>
                    <SelectContent>
                      {!templateRequired && (
                        <SelectItem value={NO_TEMPLATE}>Sem template (texto livre)</SelectItem>
                      )}
                      {approved.map((tpl) => (
                        <SelectItem key={`${tpl.name}-${tpl.language}`} value={tpl.name}>
                          {tpl.name} · {tpl.language} · {tpl.param_count} var.
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templateRequired && (
                    <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                      O WhatsApp não permite mensagem livre para iniciar conversa — o Zernio exige template.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="camp-msg">Mensagem</Label>
                  {charLimit && (
                    <span
                      className="text-xs tabular-nums"
                      style={{ color: overLimit ? "var(--via-coral, #dc2626)" : "var(--via-text-muted)" }}
                    >
                      {form.message.length}/{charLimit}
                    </span>
                  )}
                </div>
                <Textarea
                  id="camp-msg"
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Olá {{nome}}, temos uma novidade para você…"
                />
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Use {"{{nome}}"} e {"{{empresa}}"} para personalizar.
                  {selectedTemplate && (
                    <> As variáveis viram os valores do template, na ordem em que aparecem —
                      ele espera {selectedTemplate.param_count} e a mensagem tem {paramCount}.</>
                  )}
                </p>
              </div>
            </>
          )}

          {/* ---- Passo 4: agendamento ---- */}
          {step === 3 && (
            <div className="space-y-2">
              <Label htmlFor="camp-schedule">Agendamento (opcional)</Label>
              <Input
                id="camp-schedule"
                type="datetime-local"
                value={form.scheduled}
                onChange={(e) => setForm({ ...form, scheduled: e.target.value })}
              />
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Deixe vazio para criar como rascunho e disparar manualmente.
              </p>
            </div>
          )}

          {/* ---- Passo 5: revisão ---- */}
          {step === 4 && (
            <dl className="space-y-2 text-sm">
              {[
                ["Nome", form.name],
                ["Canal", channelMeta(form.channel).label],
                ["Provedor", PROVIDER_LABEL[form.provider]],
                ["Público", form.audience === ALL
                  ? "Todos alcançáveis no canal"
                  : `Tag: ${(tags ?? []).find((t) => t.id === form.tagId)?.name ?? "—"}`],
                ["Destinatários", loadingAudience ? "calculando…" : `${audienceCount ?? 0}`],
                ["Template", selectedTemplate ? `${selectedTemplate.name} (${selectedTemplate.language})` : "Sem template"],
                ["Envio", form.scheduled
                  ? new Date(form.scheduled).toLocaleString("pt-BR")
                  : "Manual (rascunho)"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--via-border)" }}>
                  <dt style={{ color: "var(--via-text-muted)" }}>{label}</dt>
                  <dd className="text-right font-medium" style={{ color: "var(--via-text-primary)" }}>{value}</dd>
                </div>
              ))}
              <div className="rounded-lg p-3" style={{ background: "var(--via-surface)" }}>
                <p className="text-xs" style={{ color: "var(--via-text-body)" }}>
                  A campanha é criada como {form.scheduled ? "agendada" : "rascunho"}. O envio real
                  só acontece quando você clicar em Disparar.
                </p>
              </div>
            </dl>
          )}

          {blocked && step < STEPS.length - 1 && (
            <p className="flex items-start gap-1.5 text-xs" style={{ color: "var(--via-coral, #dc2626)" }}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              {blocked}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))}
            className="gap-1.5"
          >
            {step === 0 ? "Cancelar" : (<><ChevronLeft className="h-4 w-4" strokeWidth={1.5} />Voltar</>)}
          </Button>
          {isLast ? (
            <Button onClick={submit} disabled={createCampaign.isPending || !!blocked}>
              {createCampaign.isPending ? "Criando…" : "Criar campanha"}
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!!blocked} className="gap-1.5">
              Avançar
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
