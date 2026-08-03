import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Recomendacao = "essencial" | "recomendado" | "opcional";

const RECOMENDACAO_LABEL: Record<Recomendacao, string> = {
  essencial: "Essencial",
  recomendado: "Recomendado",
  opcional: "Opcional",
};

/**
 * Cabeçalho padrão dos blocos de Configurações > Integrações.
 *
 * Cada bloco precisa responder três coisas antes de pedir qualquer dado: para
 * que serve, se é essencial ou opcional, e se já está ligado. O badge de status
 * segue o padrão visual da aba Canais (bg-success + CheckCircle2) para o usuário
 * ler "conectado" do mesmo jeito em toda a plataforma.
 */
export function IntegrationHeader({
  icon: Icon,
  title,
  purpose,
  recomendacao,
  connected,
  connectedLabel = "Configurado",
  disconnectedLabel = "Não configurado",
  action,
}: {
  icon: LucideIcon;
  title: string;
  purpose: string;
  recomendacao: Recomendacao;
  connected: boolean;
  connectedLabel?: string;
  disconnectedLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
            <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            {title}
          </h3>
          <Badge variant={recomendacao === "essencial" ? "default" : "secondary"}>
            {RECOMENDACAO_LABEL[recomendacao]}
          </Badge>
          {connected ? (
            <Badge className="gap-1 bg-success text-success-foreground">
              <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> {connectedLabel}
            </Badge>
          ) : (
            <Badge variant="secondary">{disconnectedLabel}</Badge>
          )}
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-muted)" }}>
          {purpose}
        </p>
      </div>
      {action}
    </div>
  );
}