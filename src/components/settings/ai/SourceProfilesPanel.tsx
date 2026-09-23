import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useStages } from "@/hooks/useDeals";
import { rotuloOrigem, useContactSources } from "@/hooks/useContactSources";
import {
  useAISourceProfiles, useDeleteAISourceProfile, useSaveAISourceProfile,
  type AISourceProfile, type FunnelModeOrigem,
} from "@/hooks/useAISourceProfiles";
import { Route } from "lucide-react";

const NONE = "__none__";
const MODOS: { value: FunnelModeOrigem; label: string }[] = [
  { value: "inherit", label: "Igual ao geral" },
  { value: "auto", label: "Mover sozinha" },
  { value: "suggest", label: "Só sugerir" },
];

/**
 * IA > Por origem: como a IA atende e aborda leads de cada origem (formulário,
 * anúncio, indicação). O que não estiver definido aqui segue o perfil geral.
 */
export function SourceProfilesPanel() {
  const { data: perfis, isLoading, error } = useAISourceProfiles();
  const apagar = useDeleteAISourceProfile();
  const [editando, setEditando] = useState<AISourceProfile | null>(null);
  const [aberto, setAberto] = useState(false);

  const remover = async (p: AISourceProfile) => {
    try {
      await apagar.mutateAsync(p.id);
      toast.success(`Perfil da origem "${p.source}" removido.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover.");
    }
  };

  if (error) return <ErrorState title="Não foi possível carregar os perfis" error={error} />;

  return (
    <div className="space-y-4" data-testid="source-profiles">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          A origem vem do contato (formulário, UTM da campanha, webhook, importação). Sem perfil, a IA usa o comportamento geral.
        </p>
        <Button onClick={() => { setEditando(null); setAberto(true); }} className="gap-1.5" data-testid="source-profile-new">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Novo perfil
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : (perfis ?? []).length === 0 ? (
        <EmptyState
          icon={Route}
          title="Nenhum perfil por origem"
          description="Crie um perfil para a IA falar diferente com quem vem de anúncio, formulário ou indicação."
          action={<Button onClick={() => { setEditando(null); setAberto(true); }}>Criar primeiro perfil</Button>}
        />
      ) : (
        <div className="space-y-3">
          {(perfis ?? []).map((p) => (
            <div key={p.id} className="via-card flex flex-wrap items-center gap-3 p-4" data-testid={`source-profile-${p.source}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium" style={{ color: "var(--via-text-primary)" }}>
                  {p.label || rotuloOrigem(p.source)} <span className="font-mono text-xs" style={{ color: "var(--via-text-muted)" }}>{p.source}</span>
                </p>
                <p className="line-clamp-2 text-sm" style={{ color: "var(--via-text-muted)" }}>
                  {p.instruction || "Sem instrução extra no atendimento."}
                </p>
              </div>
              <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                {MODOS.find((m) => m.value === p.funnel_mode)?.label}{p.is_active ? "" : " · inativo"}
              </span>
              <Button size="icon" variant="ghost" onClick={() => { setEditando(p); setAberto(true); }} aria-label="Editar perfil">
                <Pencil className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remover(p)} aria-label="Remover perfil">
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <SourceProfileDialog open={aberto} onOpenChange={setAberto} perfil={editando} />
    </div>
  );
}

function SourceProfileDialog({ open, onOpenChange, perfil }: { open: boolean; onOpenChange: (o: boolean) => void; perfil: AISourceProfile | null }) {
  const salvar = useSaveAISourceProfile();
  const { data: stages } = useStages();
  const { data: origens } = useContactSources();
  const [source, setSource] = useState("");
  const [label, setLabel] = useState("");
  const [instruction, setInstruction] = useState("");
  const [outreachInstruction, setOutreachInstruction] = useState("");
  const [outreachTemplate, setOutreachTemplate] = useState("");
  const [modo, setModo] = useState<FunnelModeOrigem>("inherit");
  const [etapa, setEtapa] = useState<string>(NONE);
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSource(perfil?.source ?? "");
    setLabel(perfil?.label ?? "");
    setInstruction(perfil?.instruction ?? "");
    setOutreachInstruction(perfil?.outreach_instruction ?? "");
    setOutreachTemplate(perfil?.outreach_template_name ?? "");
    setModo((perfil?.funnel_mode as FunnelModeOrigem) ?? "inherit");
    setEtapa(perfil?.initial_stage_id ?? NONE);
    setAtivo(perfil?.is_active ?? true);
  }, [open, perfil]);

  const gravar = async () => {
    try {
      await salvar.mutateAsync({
        id: perfil?.id,
        source,
        label: label || null,
        instruction,
        outreach_instruction: outreachInstruction,
        outreach_template_name: outreachTemplate || null,
        funnel_mode: modo,
        initial_stage_id: etapa === NONE ? null : etapa,
        is_active: ativo,
      });
      toast.success(perfil ? "Perfil atualizado." : "Perfil criado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{perfil ? "Editar perfil por origem" : "Novo perfil por origem"}</DialogTitle>
          <DialogDescription>O que muda no atendimento e na abordagem para quem chega por esta origem.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sp-source">Origem (valor gravado no contato)</Label>
              <Input id="sp-source" list="origens-perfil" value={source} onChange={(e) => setSource(e.target.value)} placeholder="meta_ads" disabled={!!perfil} data-testid="source-profile-source" />
              <datalist id="origens-perfil">
                {(origens ?? []).map((o) => <option key={o} value={o}>{rotuloOrigem(o)}</option>)}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-label">Nome amigável</Label>
              <Input id="sp-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Anúncios da Meta" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-instruction">Instrução extra no atendimento</Label>
            <Textarea id="sp-instruction" rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)}
              placeholder="Ex.: este lead viu o anúncio da promoção de setembro. Confirme o interesse no plano anual e ofereça a demonstração gratuita." data-testid="source-profile-instruction" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sp-outreach">Instrução da abordagem ativa (Evolution)</Label>
              <Textarea id="sp-outreach" rows={3} value={outreachInstruction} onChange={(e) => setOutreachInstruction(e.target.value)} placeholder="Vazio = usa a instrução geral" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-template">Template da abordagem (Meta e Zernio)</Label>
              <Input id="sp-template" value={outreachTemplate} onChange={(e) => setOutreachTemplate(e.target.value)} placeholder="Vazio = usa o template geral" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Como a IA age no funil</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as FunnelModeOrigem)}>
                <SelectTrigger aria-label="Modo do funil para esta origem"><SelectValue /></SelectTrigger>
                <SelectContent>{MODOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Etapa inicial do negócio</Label>
              <Select value={etapa} onValueChange={setEtapa}>
                <SelectTrigger aria-label="Etapa inicial para esta origem"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Igual ao geral</SelectItem>
                  {(stages ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
            <Switch aria-label="Perfil ativo" checked={ativo} onCheckedChange={setAtivo} />
            Perfil ativo
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={gravar} disabled={salvar.isPending} data-testid="source-profile-save">
            {salvar.isPending ? "Salvando…" : perfil ? "Salvar" : "Criar perfil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
