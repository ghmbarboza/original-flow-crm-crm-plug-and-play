import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";

interface PageStubProps {
  title: string;
  /** O que esta tela vai fazer quando o sprint dela chegar. */
  description: string;
  sprint: string;
  icon: LucideIcon;
}

/**
 * Shell de página ainda não implementada. Existe para que a navegação do Sprint 1
 * resolva todas as rotas sem 404 e para deixar explícito em que sprint cada tela entra.
 * Cada stub é substituído pela página real no sprint indicado.
 */
export function PageStub({ title, description, sprint, icon: Icon }: PageStubProps) {
  return (
    <AppShell>
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <Icon
            className="h-7 w-7"
            strokeWidth={1.5}
            style={{ color: "var(--via-text-muted)" }}
          />
          <h1
            className="font-display text-3xl font-medium tracking-tight"
            style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
          >
            {title}
          </h1>
        </div>
        <p style={{ color: "var(--via-text-body)" }}>{description}</p>
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Esta tela entra no {sprint}.
        </p>
      </div>
    </AppShell>
  );
}
