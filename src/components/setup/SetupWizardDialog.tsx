import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StepVoce } from "@/components/setup/StepVoce";
import { StepEmpresa } from "@/components/setup/StepEmpresa";
import { StepPublico } from "@/components/setup/StepPublico";
import { StepIA } from "@/components/setup/StepIA";
import { StepVoz } from "@/components/setup/StepVoz";
import { StepEmail } from "@/components/setup/StepEmail";
import { StepPipeline } from "@/components/setup/StepPipeline";
import { StepCanal } from "@/components/setup/StepCanal";
import { StepConcluido } from "@/components/setup/StepConcluido";
import { useSetupWizard } from "@/contexts/SetupWizardContext";
import { PESO_LABEL, SETUP_STEPS, useSetupProgress, type SetupStepKey } from "@/hooks/useSetup";

/**
 * Assistente de configuração como MODAL sobre a plataforma.
 *
 * Antes era uma tela cheia fora do AppShell, e o usuário configurava às cegas:
 * não via o produto que estava montando. Aqui o dashboard fica visível ao fundo
 * e o assistente pode ser fechado a qualquer momento sem perder progresso.
 *
 * A lógica das etapas (ordem, pular, persistência) não mudou — só o contêiner.
 */
export function SetupWizardDialog() {
  const { aberto, fechar } = useSetupWizard();
  const { data: progresso, isLoading } = useSetupProgress();
  const [step, setStep] = useState<SetupStepKey | null>(null);

  useEffect(() => {
    if (step || !progresso) return;
    const salvo = progresso.current_step as SetupStepKey | null;
    setStep(SETUP_STEPS.some((s) => s.key === salvo) ? salvo! : SETUP_STEPS[0].key);
  }, [progresso, step]);

  // Reabrir depois de um "Refazer onboarding" volta para a etapa salva.
  useEffect(() => {
    if (!aberto || !progresso) return;
    const salvo = progresso.current_step as SetupStepKey | null;
    if (salvo && (progresso.completed_steps ?? []).length === 0) setStep(salvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const indice = step ? SETUP_STEPS.findIndex((s) => s.key === step) : 0;
  const progressoPct = Math.round(((indice + 1) / SETUP_STEPS.length) * 100);

  const ir = (destino: SetupStepKey) => setStep(destino);
  const proximo = () => ir(SETUP_STEPS[Math.min(indice + 1, SETUP_STEPS.length - 1)].key);
  const anterior = () => ir(SETUP_STEPS[Math.max(indice - 1, 0)].key);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent
        className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 max-sm:h-full max-sm:max-h-full max-sm:max-w-full max-sm:rounded-none"
        data-testid="setup-dialog"
      >
        <div className="space-y-3 border-b px-5 py-4">
          {/* Sem botões de sair aqui: "Sair do setup" repetia o X do diálogo e
              "Concluir depois" parecia uma terceira saída sendo só um atalho para
              o checklist final — que se alcança avançando ou fechando e
              reabrindo por Configurações > Onboarding. */}
          <div className="pr-6">
            <DialogTitle className="via-wordmark text-sm font-normal" style={{ color: "var(--via-text-muted)" }}>
              Configuração inicial
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Assistente de configuração inicial da plataforma. Todas as etapas podem ser puladas.
          </DialogDescription>

          {/* Trilha de etapas, compacta */}
          <div className="flex items-center gap-1">
            {SETUP_STEPS.map((s, i) => (
              <div
                key={s.key}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{ background: i <= indice ? "var(--via-navy)" : "var(--via-surface)" }}
                title={s.label}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--via-text-muted)" }}>
            <span className="flex items-center gap-2">
              Etapa {indice + 1} de {SETUP_STEPS.length} — {SETUP_STEPS[indice].label}
              {step !== "concluido" && (
                <Badge
                  variant={SETUP_STEPS[indice].peso === "essencial" ? "default" : "secondary"}
                  className="text-[10px] font-normal"
                >
                  {PESO_LABEL[SETUP_STEPS[indice].peso]}
                </Badge>
              )}
            </span>
            <span className="tabular-nums">{progressoPct}%</span>
          </div>

          {/* O fio da história: por que esta etapa vem agora. */}
          <p className="text-xs" style={{ color: "var(--via-text-body)" }} data-testid="setup-historia">
            {SETUP_STEPS[indice].historia}
          </p>
        </div>

        {/* Scroll interno: QR Code, seletor de vozes e geração do prompt são altos. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5" data-testid={`setup-step-${step ?? "loading"}`}>
          {isLoading || !step ? (
            <div className="flex items-center justify-center gap-2 py-12" style={{ color: "var(--via-text-muted)" }}>
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
              Carregando configuração…
            </div>
          ) : (
            <>
              {step === "voce" && <StepVoce onNext={proximo} />}
              {step === "empresa" && <StepEmpresa onNext={proximo} onBack={anterior} />}
              {step === "publico" && <StepPublico onNext={proximo} onBack={anterior} />}
              {step === "ia" && <StepIA onNext={proximo} onBack={anterior} />}
              {step === "voz" && <StepVoz onNext={proximo} onBack={anterior} />}
              {step === "pipeline" && <StepPipeline onNext={proximo} onBack={anterior} />}
              {step === "canal" && <StepCanal onNext={proximo} onBack={anterior} />}
              {step === "email" && <StepEmail onNext={proximo} onBack={anterior} />}
              {step === "concluido" && <StepConcluido onClose={fechar} />}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
