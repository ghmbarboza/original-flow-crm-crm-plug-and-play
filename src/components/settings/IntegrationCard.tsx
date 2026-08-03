import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Recomendacao } from "@/components/settings/IntegrationHeader";

/** Estado de status exibido no header — sempre o real, nunca otimista. */
export type StatusIntegracao = "ok" | "pendente" | "ausente";

const RECOMENDACAO_LABEL: Record<Recomendacao, string> = {
  essencial: "Essencial",
  recomendado: "Recomendado",
  opcional: "Opcional",
};

/**
 * Card colapsável de Configurações > Integrações.
 *
 * A aba era uma pilha de formulários abertos: para saber o que estava ligado o
 * usuário rolava tudo. Fechado, cada integração ocupa uma linha escaneável
 * (ícone + nome + propósito + relevância + status); expandida, mostra a
 * configuração completa. `abrirPorPadrao` existe só para navegação direcionada
 * (link com ?integration=...).
 */
export function IntegrationCard({
  icon: Icon,
  title,
  purpose,
  recomendacao,
  status,
  statusLabel,
  headerAction,
  abrirPorPadrao = false,
  testId,
  children,
}: {
  icon: LucideIcon;
  title: string;
  purpose: string;
  recomendacao: Recomendacao;
  status: StatusIntegracao;
  statusLabel: string;
  /** Controle que precisa ficar acessível com o card fechado (ex.: switch do ERP). */
  headerAction?: ReactNode;
  abrirPorPadrao?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(abrirPorPadrao);

  // Navegação direcionada pode chegar depois da primeira renderização (o param
  // é lido no pai) — então o card acompanha quando ela aponta para ele.
  useEffect(() => {
    if (abrirPorPadrao) setAberto(true);
  }, [abrirPorPadrao]);

  return (
    <Collapsible open={aberto} onOpenChange={setAberto} className="via-card" data-testid={testId}>
      <div className="flex items-center gap-3 p-4">
        <CollapsibleTrigger
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          <Icon
            className="h-5 w-5 shrink-0"
            strokeWidth={1.5}
            aria-hidden
            style={{ color: "var(--via-text-muted)" }}
          />
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-sm font-medium"
              style={{ color: "var(--via-text-primary)" }}
            >
              {title}
            </span>
            <span className="block truncate text-xs" style={{ color: "var(--via-text-muted)" }}>
              {purpose}
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-2 sm:flex">
            <Badge variant={recomendacao === "essencial" ? "default" : "secondary"}>
              {RECOMENDACAO_LABEL[recomendacao]}
            </Badge>
            <StatusBadge status={status} label={statusLabel} />
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`}
            strokeWidth={1.5}
            aria-hidden
          />
        </CollapsibleTrigger>
        {headerAction}
      </div>
      {/* Em telas pequenas os badges saem do gatilho para não truncar o nome. */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:hidden">
        <Badge variant={recomendacao === "essencial" ? "default" : "secondary"}>
          {RECOMENDACAO_LABEL[recomendacao]}
        </Badge>
        <StatusBadge status={status} label={statusLabel} />
      </div>
      <CollapsibleContent>
        <div className="border-t px-4 py-4" style={{ borderColor: "var(--via-border)" }}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function StatusBadge({ status, label }: { status: StatusIntegracao; label: string }) {
  if (status === "ok") {
    return (
      <Badge className="gap-1 bg-success text-success-foreground">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} aria-hidden /> {label}
      </Badge>
    );
  }
  if (status === "pendente") {
    return (
      <Badge className="gap-1 bg-warning text-warning-foreground" data-testid="status-pendente">
        {label}
      </Badge>
    );
  }
  return <Badge variant="secondary">{label}</Badge>;
}
