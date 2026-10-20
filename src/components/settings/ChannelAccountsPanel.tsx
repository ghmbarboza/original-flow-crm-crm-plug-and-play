import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, CheckCircle2, MessageSquare, Pencil, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { DesconectarIntegracao } from "@/components/settings/DesconectarIntegracao";
import { ProviderWizard } from "@/components/whatsapp/ProviderWizard";
import { channelMeta } from "@/components/whatsapp/ChannelBadge";
import { useAuth } from "@/hooks/useAuth";
import {
  PAPEL_LABEL, rotuloDaConta, useChannelAccounts, useDisconnectChannelAccount, useReactivateChannelAccount,
  useSetNotificationsAccount, useUpdateChannelAccount,
  type ContaDeCanal, type EstadoDaConta, type ModoFunilDaConta, type PapelDaConta,
} from "@/hooks/useChannelAccounts";
import type { WhatsAppProvider } from "@/hooks/useWhatsAppConfig";

const PROVIDER_LABEL: Record<WhatsAppProvider, string> = {
  evolution: "Evolution API",
  meta_official: "API Oficial (Meta)",
  zernio: "Zernio",
};

const PAPEIS: { value: PapelDaConta; label: string; hint: string }[] = [
  { value: "passivo", label: PAPEL_LABEL.passivo, hint: "Atende quem escreve; nunca inicia conversa. Todo número novo começa assim." },
  { value: "ativo", label: PAPEL_LABEL.ativo, hint: "Inicia conversas (abordagem ativa, campanhas) e também responde." },
  { value: "ambos", label: PAPEL_LABEL.ambos, hint: "Responde e inicia conversas." },
];

const MODOS_FUNIL: { value: ModoFunilDaConta; label: string }[] = [
  { value: "inherit", label: "Igual ao geral" },
  { value: "auto", label: "Mover sozinha" },
  { value: "suggest", label: "Só sugerir" },
];

const ESTADO: Record<EstadoDaConta, { label: string; tom: "ok" | "pendente" | "fora" }> = {
  conectada: { label: "Conectada", tom: "ok" },
  aguardando: { label: "Aguardando pareamento", tom: "pendente" },
  desconectada: { label: "Desconectada", tom: "fora" },
  desligada: { label: "Desligada", tom: "fora" },
};

function EstadoBadge({ estado }: { estado: string }) {
  const meta = ESTADO[estado as EstadoDaConta] ?? ESTADO.aguardando;
  if (meta.tom === "ok") {
    return (
      <Badge className="gap-1 bg-success text-success-foreground" data-testid="status-conta">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} aria-hidden /> {meta.label}
      </Badge>
    );
  }
  if (meta.tom === "pendente") {
    return <Badge className="bg-warning text-warning-foreground" data-testid="status-conta">{meta.label}</Badge>;
  }
  return <Badge variant="secondary" data-testid="status-conta">{meta.label}</Badge>;
}

/**
 * Configurações > Integrações > Canais > Contas conectadas.
 *
 * Um cartão por número ou conta (16/10/2026: "o número define a abordagem").
 * Papel, IA e número dos avisos mudam aqui mesmo; nome, instrução própria e
 * modo de funil abrem no diálogo. "Adicionar canal" reusa o assistente de
 * conexão inteiro, quantas vezes for preciso: Evolution + Zernio + Meta ao
 * mesmo tempo é o cenário normal, não a exceção.
 */
export function ChannelAccountsPanel() {
  const { isAdmin } = useAuth();
  const { data: contas, isLoading, error, refetch, isFetching } = useChannelAccounts();
  const [adicionando, setAdicionando] = useState(false);
  // Guarda só o id: a conta editada é sempre a versão atual da lista, não um
  // snapshot que outra aba pode ter deixado para trás.
  const [editandoId, setEditandoId] = useState<string | null>(null);

  if (error) return <ErrorState title="Não foi possível carregar as contas" error={error} />;

  if (adicionando) {
    return (
      <div className="space-y-4" data-testid="channel-accounts-wizard">
        <Button variant="ghost" size="sm" onClick={() => setAdicionando(false)}>← Voltar para as contas</Button>
        <ProviderWizard onDone={() => { setAdicionando(false); refetch(); }} doneLabel="Voltar para as contas" />
      </div>
    );
  }

  const lista = contas ?? [];
  const editando = lista.find((c) => c.id === editandoId) ?? null;
  const ativas = lista.filter((c) => c.is_active);
  const desligadas = lista.filter((c) => !c.is_active);

  return (
    <div className="space-y-4" data-testid="channel-accounts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Cada número ou conta conectada aparece aqui com o próprio papel e as próprias regras da IA.
          A conversa sempre sai pelo número em que entrou.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar contas">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} strokeWidth={1.5} />
          </Button>
          {isAdmin && (
            <Button className="gap-1.5" onClick={() => setAdicionando(true)} data-testid="channel-accounts-add">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Adicionar canal
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Nenhum canal conectado"
          description="Conecte um número de WhatsApp pelo Evolution, pela API oficial da Meta ou pelo Zernio. Depois, adicione quantos precisar."
          action={isAdmin ? <Button onClick={() => setAdicionando(true)}>Conectar o primeiro canal</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {ativas.map((conta) => (
            <ContaCard key={conta.id} conta={conta} podeEditar={isAdmin} onEditar={() => setEditandoId(conta.id)} onReconectar={() => setAdicionando(true)} />
          ))}
          {desligadas.length > 0 && (
            <div className="space-y-3 border-t pt-3" style={{ borderColor: "var(--via-border)" }}>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--via-text-muted)" }}>
                Desligadas
              </p>
              {desligadas.map((conta) => (
                <ContaCard key={conta.id} conta={conta} podeEditar={isAdmin} onEditar={() => setEditandoId(conta.id)} onReconectar={() => setAdicionando(true)} />
              ))}
            </div>
          )}
        </div>
      )}

      <ContaDialog conta={editando} onOpenChange={(aberto) => { if (!aberto) setEditandoId(null); }} />
    </div>
  );
}

function ContaCard({
  conta, podeEditar, onEditar, onReconectar,
}: {
  conta: ContaDeCanal;
  podeEditar: boolean;
  onEditar: () => void;
  onReconectar: () => void;
}) {
  const atualizar = useUpdateChannelAccount();
  const definirAvisos = useSetNotificationsAccount();
  const desconectar = useDisconnectChannelAccount();
  const religar = useReactivateChannelAccount();
  const { Icon } = channelMeta(conta.channel);
  const ocupado = atualizar.isPending || definirAvisos.isPending || desconectar.isPending || religar.isPending;

  const salvar = async (patch: { role?: PapelDaConta; ai_enabled?: boolean }) => {
    try {
      await atualizar.mutateAsync({ id: conta.id, ...patch });
      toast.success("Conta atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const usarParaAvisos = async () => {
    try {
      await definirAvisos.mutateAsync(conta.id);
      toast.success(`Os avisos por WhatsApp passam a sair por "${rotuloDaConta(conta)}".`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível definir o número dos avisos.");
    }
  };

  const desligar = async () => {
    try {
      await desconectar.mutateAsync(conta);
      toast.success("Conta desligada. Nenhuma mensagem entra ou sai por ela até religar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível desligar.");
    }
  };

  const voltar = async () => {
    try {
      await religar.mutateAsync(conta);
      toast.success("Conta religada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível religar.");
    }
  };

  const papel = PAPEIS.find((p) => p.value === conta.role) ?? PAPEIS[2];

  return (
    <div
      className="via-card space-y-3 p-4"
      style={conta.is_active ? undefined : { opacity: 0.7 }}
      data-testid={`channel-account-${conta.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--via-surface)", color: "var(--via-text-muted)" }}
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              {rotuloDaConta(conta)}
            </p>
            <p className="truncate text-xs" style={{ color: "var(--via-text-muted)" }}>
              {PROVIDER_LABEL[conta.provider]} · {channelMeta(conta.channel).label}
              {conta.detalhe && conta.label.trim() ? ` · ${conta.detalhe}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {conta.notifications_default && (
            <Badge variant="secondary" className="gap-1" data-testid="channel-account-notifications-badge">
              <BellRing className="h-3 w-3" strokeWidth={1.5} aria-hidden /> Envia os avisos
            </Badge>
          )}
          <EstadoBadge estado={conta.estado} />
        </div>
      </div>

      {conta.ai_instruction.trim() && (
        <p className="line-clamp-2 text-xs" style={{ color: "var(--via-text-body)" }}>
          Regras deste número: {conta.ai_instruction}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`papel-${conta.id}`}>Papel</Label>
            <Select
              value={conta.role}
              onValueChange={(v) => salvar({ role: v as PapelDaConta })}
              disabled={!podeEditar || !conta.is_active || ocupado || conta.channel !== "whatsapp"}
            >
              <SelectTrigger id={`papel-${conta.id}`} className="h-8 w-52" data-testid="channel-account-role" aria-label="Papel do número">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{papel.hint}</p>
          </div>
          <label className="flex h-8 items-center gap-2 pb-5 text-sm" style={{ color: "var(--via-text-body)" }}>
            <Switch
              checked={conta.ai_enabled}
              onCheckedChange={(v) => salvar({ ai_enabled: v })}
              disabled={!podeEditar || !conta.is_active || ocupado}
              aria-label="IA responde por este número"
              data-testid="channel-account-ai"
            />
            IA responde
          </label>
        </div>

        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {conta.is_active && conta.channel === "whatsapp" && !conta.notifications_default && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={usarParaAvisos} disabled={ocupado} data-testid="channel-account-notifications">
                <BellRing className="h-3.5 w-3.5" strokeWidth={1.5} />
                Usar para avisos
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEditar} disabled={ocupado} data-testid="channel-account-edit">
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              Editar
            </Button>
            {conta.is_active ? (
              <DesconectarIntegracao
                titulo={`Desligar "${rotuloDaConta(conta)}"?`}
                consequencia="O CRM para de receber e de responder por este número: a IA fica muda e nada dele entra na Inbox. As conversas e a configuração ficam salvas. Os outros números continuam funcionando."
                rotulo="Desligar"
                onConfirmar={desligar}
                disabled={ocupado}
                testId="channel-account-disconnect"
              />
            ) : conta.provider === "evolution" ? (
              <Button variant="outline" size="sm" onClick={onReconectar} disabled={ocupado}>Reconectar pelo QR</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={voltar} disabled={ocupado}>Religar</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContaDialog({ conta, onOpenChange }: { conta: ContaDeCanal | null; onOpenChange: (aberto: boolean) => void }) {
  const atualizar = useUpdateChannelAccount();
  const [label, setLabel] = useState("");
  const [instrucao, setInstrucao] = useState("");
  const [modo, setModo] = useState<ModoFunilDaConta>("inherit");
  const [papel, setPapel] = useState<PapelDaConta>("ambos");
  const [ia, setIa] = useState(true);
  const aberto = !!conta;

  useEffect(() => {
    if (!conta) return;
    setLabel(conta.label);
    setInstrucao(conta.ai_instruction);
    setModo((conta.ai_funnel_mode as ModoFunilDaConta) ?? "inherit");
    setPapel((conta.role as PapelDaConta) ?? "ambos");
    setIa(conta.ai_enabled);
    // Só o id: recarga da lista no meio da edição não pode apagar o que está sendo digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta?.id]);

  const gravar = async () => {
    if (!conta) return;
    try {
      await atualizar.mutateAsync({ id: conta.id, label: label.trim(), ai_instruction: instrucao.trim(), ai_funnel_mode: modo, role: papel, ai_enabled: ia });
      toast.success("Conta atualizada.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regras deste número</DialogTitle>
          <DialogDescription>
            {conta ? `${PROVIDER_LABEL[conta.provider]} · ${conta.detalhe ?? channelMeta(conta.channel).label}` : ""}. O que não estiver aqui segue Configurações › IA.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="conta-label">Nome na tela</Label>
            <Input id="conta-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Comercial, Suporte, Número da loja" data-testid="channel-account-label" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={papel} onValueChange={(v) => setPapel(v as PapelDaConta)} disabled={conta?.channel !== "whatsapp"}>
                <SelectTrigger aria-label="Papel do número"><SelectValue /></SelectTrigger>
                <SelectContent>{PAPEIS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Como a IA age no funil</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as ModoFunilDaConta)}>
                <SelectTrigger aria-label="Modo do funil para este número"><SelectValue /></SelectTrigger>
                <SelectContent>{MODOS_FUNIL.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="conta-instrucao">Instrução extra da IA neste número</Label>
            <Textarea
              id="conta-instrucao"
              rows={4}
              maxLength={4000}
              value={instrucao}
              onChange={(e) => setInstrucao(e.target.value)}
              placeholder="Ex.: este é o número do suporte. Não ofereça produtos novos; resolva o problema e, se não conseguir, transfira para a equipe."
              data-testid="channel-account-instruction"
            />
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Entra no prompt por cima do comportamento geral e do perfil por origem.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
            <Switch checked={ia} onCheckedChange={setIa} aria-label="IA responde por este número" />
            IA responde por este número
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={gravar} disabled={atualizar.isPending} data-testid="channel-account-save">
            {atualizar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
