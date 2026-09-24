import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useOrganization, useSaveSetupStep } from "@/hooks/useSetup";
import {
  BLOCO_LABELS, selecionarTudo, useApplyStarterKit, useGenerateStarterKit,
  type BlocoKit, type KitInicial, type SelecaoKit,
} from "@/hooks/useStarterKit";

/**
 * Etapa "Kit inicial" do wizard: a IA monta automações, follow-up, sequências,
 * modelos de e-mail, templates de WhatsApp e respostas rápidas a partir do
 * perfil da empresa; o usuário revisa, marca o que quer e aplica.
 */
export function StepKit({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) {
  const { data: org } = useOrganization();
  const gerar = useGenerateStarterKit();
  const aplicar = useApplyStarterKit();
  const salvarEtapa = useSaveSetupStep();
  const [kit, setKit] = useState<KitInicial | null>(null);
  const [selecao, setSelecao] = useState<SelecaoKit | null>(null);
  const jaAplicado = !!(org as { starter_kit_applied_at?: string | null } | null | undefined)?.starter_kit_applied_at;

  const gerarKit = async () => {
    try {
      const k = await gerar.mutateAsync();
      setKit(k);
      setSelecao(selecionarTudo(k));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o kit.");
    }
  };

  const alternar = (bloco: Exclude<BlocoKit, "followup">, i: number) => {
    if (!selecao) return;
    const atual = selecao[bloco];
    setSelecao({ ...selecao, [bloco]: atual.includes(i) ? atual.filter((x) => x !== i) : [...atual, i] });
  };

  const aplicarKit = async () => {
    if (!kit || !selecao) return;
    try {
      const feitos = await aplicar.mutateAsync({ kit, selecao });
      const total = Object.values(feitos).reduce((a, b) => a + b, 0);
      toast.success(`${total} ${total === 1 ? "item aplicado" : "itens aplicados"}. Automações e follow-up nascem desligados.`);
      await salvarEtapa.mutateAsync({ step: "kit" });
      onNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível aplicar o kit.");
    }
  };

  const pular = async () => {
    try {
      await salvarEtapa.mutateAsync({ step: "kit" });
      onNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível avançar.");
    }
  };

  const totalSelecionado = selecao
    ? selecao.automations.length + (selecao.followup ? 1 : 0) + selecao.sequences.length + selecao.email_templates.length + selecao.whatsapp_templates.length + selecao.quick_replies.length
    : 0;

  return (
    <div className="space-y-5" data-testid="setup-kit">
      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>Kit inicial</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Com o que você contou, a IA monta automações, réguas e modelos já com o nome da empresa, o setor e o público.
          Revise, desmarque o que não quiser e aplique. Tudo pode ser editado depois.
        </p>
        {jaAplicado && (
          <p className="mt-1 text-xs" style={{ color: "var(--via-text-muted)" }}>Um kit já foi aplicado nesta organização. Gerar de novo cria itens adicionais.</p>
        )}
      </div>

      {!kit ? (
        <div className="via-card flex flex-col items-center gap-3 p-8 text-center">
          <Sparkles className="h-8 w-8" strokeWidth={1.5} style={{ color: "var(--via-navy)" }} />
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>Leva cerca de um minuto.</p>
          <Button onClick={gerarKit} disabled={gerar.isPending} data-testid="kit-gerar">
            {gerar.isPending ? <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> Gerando…</> : "Gerar meu kit"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {(Object.keys(BLOCO_LABELS) as BlocoKit[]).map((bloco) => {
            if (bloco === "followup") {
              if (!kit.followup) return null;
              return (
                <div key={bloco} className="via-card space-y-2 p-4">
                  <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                    <Checkbox checked={!!selecao?.followup} onCheckedChange={(v) => selecao && setSelecao({ ...selecao, followup: !!v })} aria-label={BLOCO_LABELS.followup} />
                    {BLOCO_LABELS.followup}
                  </label>
                  <ul className="space-y-1 pl-6 text-xs" style={{ color: "var(--via-text-muted)" }}>
                    {kit.followup.steps.map((s, i) => <li key={i}>Após {s.delay_hours}h: {s.message}</li>)}
                  </ul>
                </div>
              );
            }
            const itens = kit[bloco] as { name?: string; shortcut?: string; subject?: string; body_text?: string; description?: string; content?: string }[];
            if (!itens.length) return null;
            return (
              <div key={bloco} className="via-card space-y-2 p-4">
                <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{BLOCO_LABELS[bloco]}</p>
                <ul className="space-y-2">
                  {itens.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={!!selecao?.[bloco].includes(i)}
                        onCheckedChange={() => alternar(bloco, i)}
                        aria-label={item.name ?? item.shortcut ?? `item ${i + 1}`}
                        data-testid={`kit-item-${bloco}-${i}`}
                      />
                      <span style={{ color: "var(--via-text-body)" }}>
                        <span className="font-medium" style={{ color: "var(--via-text-primary)" }}>{item.name ?? (item.shortcut ? `/${item.shortcut}` : "")}</span>
                        {item.subject ? ` · ${item.subject}` : ""}
                        {item.description ? ` · ${item.description}` : ""}
                        {item.body_text ? <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>{item.body_text}</span> : null}
                        {item.content ? <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>{item.content}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={gerarKit} disabled={gerar.isPending} className="gap-1.5">
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              {gerar.isPending ? "Gerando…" : "Regenerar"}
            </Button>
            <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>{totalSelecionado} selecionado{totalSelecionado === 1 ? "" : "s"}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        {onBack ? <Button variant="ghost" onClick={onBack}>Voltar</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={pular} disabled={aplicar.isPending} data-testid="setup-skip-kit">Pular por agora</Button>
          <Button onClick={aplicarKit} disabled={!kit || totalSelecionado === 0 || aplicar.isPending} data-testid="kit-aplicar">
            {aplicar.isPending ? "Aplicando…" : "Aplicar selecionados"}
          </Button>
        </div>
      </div>
    </div>
  );
}
