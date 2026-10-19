import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, Plus, Trash2, Zap } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ACTIONS, TRIGGERS, useSaveAutomation,
  type Automation, type AutomationAction, type AutomationCondition, type ActionType, type TriggerType,
} from "@/hooks/useAutomations";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { useEmailSequences } from "@/hooks/useEmailSequences";
import { useTags } from "@/hooks/useTags";
import { useStages } from "@/hooks/useDeals";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";
import { podeIniciarConversa, rotuloDaConta, useChannelAccounts } from "@/hooks/useChannelAccounts";
import { rotuloOrigem, useContactSources } from "@/hooks/useContactSources";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automation?: Automation | null;
}

const NUMERO_AUTOMATICO = "__auto__";

/**
 * "Pelo número": qual conta de WhatsApp dispara a ação. Vazio = automático
 * (primeiro número que pode iniciar conversa, Evolution > Meta > Zernio). É o
 * que permite abordar por um número e continuar a conversa por outro: cada
 * ação do fluxo aponta o seu.
 */
function SeletorDeNumero({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: contas } = useChannelAccounts();
  const elegiveis = (contas ?? []).filter(podeIniciarConversa);
  return (
    <div className="space-y-1">
      <Label className="text-xs font-normal">Pelo número</Label>
      <Select value={value || NUMERO_AUTOMATICO} onValueChange={(v) => onChange(v === NUMERO_AUTOMATICO ? "" : v)}>
        <SelectTrigger className="h-8" data-testid="action-channel-account" aria-label="Número que envia">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NUMERO_AUTOMATICO}>Automático (primeiro número que pode iniciar conversa)</SelectItem>
          {elegiveis.map((c) => <SelectItem key={c.id} value={c.id}>{rotuloDaConta(c)}</SelectItem>)}
        </SelectContent>
      </Select>
      {elegiveis.length === 0 && (
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Nenhum número com papel ativo. Em Integrações › Canais, marque um número como “Responde e prospecta”.
        </p>
      )}
    </div>
  );
}

/** Renderiza o campo de parâmetro certo para cada tipo de ação. */
/** Campos que as condições costumam usar; "Origem" é o que separa formulário, anúncio, indicação. */
const CAMPOS_CONDICAO = [
  { value: "source", label: "Origem" },
  { value: "status", label: "Status" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "title", label: "Título (negócio)" },
  { value: "stage_id", label: "Etapa (id)" },
] as const;

function ActionParam({ action, onChange }: { action: AutomationAction; onChange: (params: Record<string, string>) => void }) {
  const { data: templates } = useEmailTemplates();
  const { data: sequences } = useEmailSequences();
  const { data: tags } = useTags();
  const { data: stages } = useStages();
  const { data: canal } = useWhatsAppSetup();
  const meta = ACTIONS.find((a) => a.value === action.type)!;
  const value = action.params[meta.param] ?? "";
  const set = (v: string) => onChange({ [meta.param]: v });

  // Ações de WhatsApp guardam dois parâmetros: o texto e o número. `set` acima
  // substitui o objeto inteiro, então aqui o patch é mesclado à mão.
  const mesclar = (patch: Record<string, string>) => onChange({ ...action.params, ...patch });
  const numero = action.params.channel_account_id ?? "";

  if (action.type === "ai_outreach") {
    const provider = canal?.configured ? canal.provider : null;
    return (
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-xs font-normal">{meta.paramLabel}</Label>
          <Textarea rows={2} value={value} onChange={(e) => mesclar({ instruction: e.target.value })}
            placeholder="Ex.: diga que viu o pedido pelo site e pergunte o melhor horário para uma ligação" />
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            {provider === "evolution"
              ? "Atenção: pelo Evolution (não oficial) a abordagem ativa tem alto risco de bloqueio do número da empresa."
              : provider === "meta_official" || provider === "zernio"
                ? "Canal oficial: sai o template aprovado escolhido em IA > Abordagem ativa; a instrução vale quando o lead responder."
                : "Nenhum canal de WhatsApp conectado: a ação vai falhar até conectar um em Integrações."}
          </p>
        </div>
        <SeletorDeNumero value={numero} onChange={(id) => mesclar({ channel_account_id: id })} />
      </div>
    );
  }

  if (action.type === "send_whatsapp") {
    return (
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-xs font-normal">{meta.paramLabel}</Label>
          <Textarea rows={3} value={value} onChange={(e) => mesclar({ message: e.target.value })}
            placeholder="Ex.: Oi {{contact.first_name}}, aqui é do suporte. Vi que você falou com o comercial e já estou acompanhando o seu caso."
            data-testid="action-whatsapp-message" />
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Aceita {"{{contact.first_name}}"}, {"{{contact.name}}"} e {"{{contact.company_name}}"}. Entra na fila de envio e sai em poucos minutos.
            Pela Meta e pelo Zernio só é entregue dentro da janela de 24h de uma conversa já aberta; a falha fica em Mensagens agendadas. A conversa fica com a IA para a resposta.
          </p>
        </div>
        <SeletorDeNumero value={numero} onChange={(id) => mesclar({ channel_account_id: id })} />
      </div>
    );
  }

  const options =
    action.type === "send_email" ? (templates ?? []).map((t) => ({ value: t.id, label: t.name }))
    : action.type === "start_sequence" ? (sequences ?? []).map((s) => ({ value: s.id, label: s.name }))
    : action.type === "add_tag" ? (tags ?? []).map((t) => ({ value: t.id, label: t.name }))
    : action.type === "move_deal" ? (stages ?? []).map((s) => ({ value: s.id, label: s.name }))
    : null;

  return (
    <div className="space-y-1">
      <Label className="text-xs font-normal">{meta.paramLabel}</Label>
      {options ? (
        <Select value={value} onValueChange={set}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Escolha" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input className="h-8" value={value} onChange={(e) => set(e.target.value)} placeholder={meta.paramLabel} />
      )}
    </div>
  );
}

export function AutomationBuilderDialog({ open, onOpenChange, automation }: Props) {
  const isEdit = !!automation;
  const saveAutomation = useSaveAutomation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<TriggerType>("contact_created");
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const { data: origens } = useContactSources();

  useEffect(() => {
    if (!open) return;
    setName(automation?.name ?? "");
    setDescription(automation?.description ?? "");
    const t = automation?.trigger as { type?: TriggerType } | null;
    setTrigger(t?.type ?? "contact_created");
    setConditions((automation?.conditions as unknown as AutomationCondition[] | null) ?? []);
    setActions((automation?.actions as unknown as AutomationAction[] | null) ?? []);
  }, [open, automation]);

  const addCondition = () => setConditions([...conditions, { field: "", op: "eq", value: "" }]);
  const addAction = () => setActions([...actions, { type: "send_email", params: {} }]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome da automação.");
      return;
    }
    if (actions.length === 0) {
      toast.error("Adicione ao menos uma ação.");
      return;
    }
    try {
      await saveAutomation.mutateAsync({
        id: automation?.id,
        name: name.trim(),
        description: description.trim() || null,
        trigger: { type: trigger },
        conditions: conditions.filter((c) => c.field.trim()),
        actions,
      });
      toast.success(isEdit ? "Automação atualizada." : "Automação criada.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a automação.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar automação" : "Nova automação"}</DialogTitle>
          <DialogDescription>Quando o gatilho acontecer e as condições baterem, as ações rodam.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="auto-name">Nome</Label>
              <Input id="auto-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auto-desc">Descrição</Label>
              <Input id="auto-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          {/* Gatilho */}
          <div className="via-card space-y-2 p-3">
            <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              <Zap className="h-4 w-4" strokeWidth={1.5} />
              Quando (gatilho)
            </p>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as TriggerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          </div>

          {/* Condições */}
          <div className="via-card space-y-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Se (condições, opcional)</p>
              <Button size="sm" variant="ghost" onClick={addCondition} className="gap-1">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
            {conditions.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Sem condições — roda sempre que o gatilho acontecer.</p>
            ) : (
              conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={cond.field || "__custom__"} onValueChange={(v) => setConditions(conditions.map((c, j) => j === i ? { ...c, field: v === "__custom__" ? "" : v } : c))}>
                    <SelectTrigger className="h-8 w-40" aria-label="Campo da condição"><SelectValue placeholder="campo" /></SelectTrigger>
                    <SelectContent>
                      {CAMPOS_CONDICAO.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      <SelectItem value="__custom__">Outro campo…</SelectItem>
                    </SelectContent>
                  </Select>
                  {!CAMPOS_CONDICAO.some((f) => f.value === cond.field) && (
                    <Input className="h-8 w-32" placeholder="campo" value={cond.field}
                      onChange={(e) => setConditions(conditions.map((c, j) => j === i ? { ...c, field: e.target.value } : c))} />
                  )}
                  <Select value={cond.op} onValueChange={(v) => setConditions(conditions.map((c, j) => j === i ? { ...c, op: v as AutomationCondition["op"] } : c))}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">igual a</SelectItem>
                      <SelectItem value="neq">diferente de</SelectItem>
                      <SelectItem value="contains">contém</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input className="h-8 flex-1" placeholder={cond.field === "source" ? "origem (ex.: capture_form)" : "valor"} value={cond.value}
                    list={cond.field === "source" ? "origens-conhecidas" : undefined}
                    onChange={(e) => setConditions(conditions.map((c, j) => j === i ? { ...c, value: e.target.value } : c))} />
                  {cond.field === "source" && (
                    <datalist id="origens-conhecidas">
                      {(origens ?? []).map((o) => <option key={o} value={o}>{rotuloOrigem(o)}</option>)}
                    </datalist>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => setConditions(conditions.filter((_, j) => j !== i))} aria-label="Remover condição">
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-center">
            <ArrowDown className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          </div>

          {/* Ações */}
          <div className="via-card space-y-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Então (ações)</p>
              <Button size="sm" variant="ghost" onClick={addAction} className="gap-1" aria-label="Adicionar ação">
                <Plus className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
            {actions.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Adicione ao menos uma ação.</p>
            ) : (
              actions.map((action, i) => (
                <div key={i} className="space-y-2 rounded-md p-2" style={{ background: "var(--via-surface)" }}>
                  <div className="flex items-center gap-2">
                    <Select
                      value={action.type}
                      onValueChange={(v) => setActions(actions.map((a, j) => j === i ? { type: v as ActionType, params: {} } : a))}
                    >
                      <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" onClick={() => setActions(actions.filter((_, j) => j !== i))} aria-label="Remover ação">
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                  <ActionParam action={action} onChange={(params) => setActions(actions.map((a, j) => j === i ? { ...a, params } : a))} />
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saveAutomation.isPending}>
            {saveAutomation.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar automação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
