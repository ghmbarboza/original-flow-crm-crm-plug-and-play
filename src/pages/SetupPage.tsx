import { Rocket } from "lucide-react";

/**
 * Wizard de onboarding, fullscreen e fora do AppLayout.
 * Conteúdo real entra no Sprint 5.
 */
export default function SetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="via-card max-w-md space-y-4 p-8 text-center">
        <Rocket
          className="mx-auto h-8 w-8"
          strokeWidth={1.5}
          style={{ color: "var(--via-text-muted)" }}
        />
        <h1
          className="font-display text-2xl font-medium tracking-tight"
          style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
        >
          Configuração inicial
        </h1>
        <p style={{ color: "var(--via-text-body)" }}>
          Wizard que configura organização, pipeline, provedor de WhatsApp e IA na
          primeira execução.
        </p>
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Esta tela entra no Sprint 5.
        </p>
      </div>
    </div>
  );
}
