import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, Server, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvolutionSetup } from "@/components/whatsapp/EvolutionSetup";
import { MetaSetup } from "@/components/whatsapp/MetaSetup";
import { useSetProvider, type WhatsAppProvider } from "@/hooks/useWhatsAppConfig";

type Step = "choose" | "setup" | "done";

const STEPS: { key: Step; label: string }[] = [
  { key: "choose", label: "Provedor" },
  { key: "setup", label: "Conexão" },
  { key: "done", label: "Pronto" },
];

interface ProviderOption {
  value: WhatsAppProvider;
  title: string;
  description: string;
  icon: typeof Zap;
  note: string;
}

const OPTIONS: ProviderOption[] = [
  {
    value: "evolution",
    title: "Evolution API",
    description: "Conecta um número comum de WhatsApp via QR Code, através de um servidor Evolution.",
    icon: Server,
    note: "Ideal para começar rápido com um número existente. Campanhas em massa não ficam disponíveis.",
  },
  {
    value: "meta_official",
    title: "API Oficial (Meta)",
    description: "Usa a WhatsApp Business Platform oficial, com número verificado e recursos de campanha.",
    icon: Zap,
    note: "Requer conta Business aprovada na Meta. Libera campanhas e templates oficiais.",
  },
];

export function ProviderWizard({ onDone }: { onDone: () => void }) {
  const setProvider = useSetProvider();
  const [step, setStep] = useState<Step>("choose");
  const [provider, setProvider_] = useState<WhatsAppProvider | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const chooseProvider = async (value: WhatsAppProvider) => {
    setProvider_(value);
    try {
      // Grava a escolha já aqui: o inbox e as campanhas dependem do provider,
      // e se o usuário abandonar no meio a config parcial ainda faz sentido.
      await setProvider.mutateAsync(value);
      setStep("setup");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o provedor.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Cabeçalho + stepper */}
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "var(--via-surface)" }}
          >
            <MessageCircle className="h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          </div>
        </div>
        <div>
          <h1
            className="font-display text-2xl font-medium tracking-tight"
            style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
          >
            Configurar WhatsApp
          </h1>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Conecte um provedor para começar a atender pelo WhatsApp com IA.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
                style={
                  i <= stepIndex
                    ? { background: "var(--via-navy)", color: "var(--via-white)" }
                    : { background: "var(--via-surface)", color: "var(--via-text-muted)" }
                }
              >
                {i < stepIndex ? "✓" : i + 1}
              </span>
              <span
                className="text-xs"
                style={{ color: i <= stepIndex ? "var(--via-text-primary)" : "var(--via-text-muted)" }}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="h-px w-6" style={{ background: "var(--via-border)" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Passo 1: escolha do provedor */}
      {step === "choose" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseProvider(option.value)}
                disabled={setProvider.isPending}
                className="via-card flex flex-col gap-3 p-5 text-left transition-shadow hover:shadow-md disabled:opacity-60"
              >
                <Icon className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-primary)" }} />
                <div>
                  <p className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
                    {option.title}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
                    {option.description}
                  </p>
                </div>
                <p className="mt-auto text-xs" style={{ color: "var(--via-text-muted)" }}>
                  {option.note}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Passo 2: conexão específica do provedor */}
      {step === "setup" && provider === "evolution" && (
        <EvolutionSetup onConnected={() => setStep("done")} onBack={() => setStep("choose")} />
      )}
      {step === "setup" && provider === "meta_official" && (
        <MetaSetup onConnected={() => setStep("done")} onBack={() => setStep("choose")} />
      )}

      {/* Passo 3: resumo */}
      {step === "done" && (
        <div className="via-card flex flex-col items-center gap-4 p-8 text-center">
          <CheckCircle2 className="h-12 w-12" strokeWidth={1.5} style={{ color: "var(--via-success)" }} />
          <div>
            <p className="text-lg font-medium" style={{ color: "var(--via-text-primary)" }}>
              WhatsApp configurado
            </p>
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Provedor: {provider === "evolution" ? "Evolution API" : "API Oficial (Meta)"}. As conversas
              recebidas passam a aparecer no inbox. Configure a personalidade da IA em Configurações › IA.
            </p>
          </div>
          <Button onClick={onDone}>Abrir inbox</Button>
        </div>
      )}
    </div>
  );
}
