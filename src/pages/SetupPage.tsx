import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StepVoce } from "@/components/setup/StepVoce";
import { StepEmpresa } from "@/components/setup/StepEmpresa";
import { StepPublico } from "@/components/setup/StepPublico";
import { StepIA } from "@/components/setup/StepIA";
import { StepPipeline } from "@/components/setup/StepPipeline";
import { StepCanal } from "@/components/setup/StepCanal";
import { StepConcluido } from "@/components/setup/StepConcluido";
import {
  PESO_LABEL, SETUP_STEPS, useOrganization, useSetupProgress, type SetupStepKey,
} from "@/hooks/useSetup";

/**
 * Wizard de configuração inicial.
 *
 * Fullscreen e fora do AppShell de propósito: sidebar e header levariam o
 * usuário a navegar para telas ainda vazias no meio da configuração.
 *
 * O passo atual vem de setup_progress, então fechar o navegador e voltar retoma
 * de onde parou em vez de recomeçar.
 */
export default function SetupPage() {
  const navigate = useNavigate();
  const { data: org, isLoading: loadingOrg } = useOrganization();
  const { data: progresso, isLoading: loadingProgresso } = useSetupProgress();

  const [step, setStep] = useState<SetupStepKey | null>(null);

  useEffect(() => {
    if (step || !progresso) return;
    const salvo = progresso.current_step as SetupStepKey | null;
    setStep(SETUP_STEPS.some((s) => s.key === salvo) ? salvo! : SETUP_STEPS[0].key);
  }, [progresso, step]);

  if (loadingOrg || loadingProgresso || !step) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2" style={{ color: "var(--via-text-muted)" }}>
        <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
        Carregando configuração…
      </div>
    );
  }

  const indice = SETUP_STEPS.findIndex((s) => s.key === step);
  const progressoPct = Math.round(((indice + 1) / SETUP_STEPS.length) * 100);

  const ir = (destino: SetupStepKey) => {
    setStep(destino);
    window.scrollTo({ top: 0 });
  };
  const proximo = () => ir(SETUP_STEPS[Math.min(indice + 1, SETUP_STEPS.length - 1)].key);
  const anterior = () => ir(SETUP_STEPS[Math.max(indice - 1, 0)].key);
  // Atalho para o checklist final. Ninguém fica preso no wizard: quem quer sair
  // agora vê antes o que ficou pendente e como retomar depois.
  const concluirDepois = () => ir("concluido");

  const pesoAtual = PESO_LABEL[SETUP_STEPS[indice].peso];

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--via-bg)" }}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="via-wordmark text-sm" style={{ color: "var(--via-text-muted)" }}>
              Configuração inicial
            </span>
            <div className="flex items-center gap-2">
              {step !== "concluido" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={concluirDepois}
                  data-testid="setup-finish-later"
                >
                  Concluir depois
                </Button>
              )}
              {org?.setup_completed === true && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/dashboard")}
                  data-testid="setup-exit"
                >
                  Sair do setup
                </Button>
              )}
            </div>
          </div>

          {/* Trilha de etapas */}
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
                  {pesoAtual}
                </Badge>
              )}
            </span>
            <span className="tabular-nums">{progressoPct}%</span>
          </div>
        </div>

        <div className="via-card p-6" data-testid={`setup-step-${step}`}>
          {step === "voce" && <StepVoce onNext={proximo} />}
          {step === "empresa" && <StepEmpresa onNext={proximo} onBack={anterior} />}
          {step === "publico" && <StepPublico onNext={proximo} onBack={anterior} />}
          {step === "ia" && <StepIA onNext={proximo} onBack={anterior} />}
          {step === "pipeline" && <StepPipeline onNext={proximo} onBack={anterior} />}
          {step === "canal" && <StepCanal onNext={proximo} onBack={anterior} />}
          {step === "concluido" && <StepConcluido />}
        </div>
      </div>
    </div>
  );
}
