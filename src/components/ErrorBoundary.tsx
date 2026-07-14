import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Nome do módulo, usado na mensagem ao usuário. */
  moduleName?: string;
}

interface State {
  error: Error | null;
}

/**
 * Captura erros de render das páginas. O usuário sempre vê o que aconteceu e o
 * que fazer — nunca uma tela branca, nunca uma falha silenciosa.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const where = this.props.moduleName ? ` em ${this.props.moduleName}` : "";

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="via-card max-w-md space-y-4 p-6 text-center">
          <h2
            className="font-display text-xl font-medium"
            style={{ color: "var(--via-text-primary)" }}
          >
            Algo deu errado{where}
          </h2>
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            Não foi possível carregar esta tela. Tente novamente; se o erro persistir,
            recarregue a página ou avise um administrador.
          </p>
          <p
            className="rounded-md p-2 text-left font-mono text-xs"
            style={{ background: "var(--via-surface)", color: "var(--via-text-muted)" }}
          >
            {error.message}
          </p>
          <Button onClick={this.reset} className="gap-2">
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }
}
