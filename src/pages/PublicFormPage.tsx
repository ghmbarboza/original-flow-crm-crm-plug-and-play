import { useParams } from "react-router-dom";
import { ClipboardList } from "lucide-react";

/**
 * Formulário público de captura de leads (`/f/:slug`).
 * Sem autenticação e sem sidebar: é a única rota da aplicação acessível a visitantes.
 * Conteúdo real entra no Sprint 5.
 */
export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="via-card max-w-md space-y-4 p-8 text-center">
        <ClipboardList
          className="mx-auto h-8 w-8"
          strokeWidth={1.5}
          style={{ color: "var(--via-text-muted)" }}
        />
        <h1
          className="font-display text-2xl font-medium tracking-tight"
          style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
        >
          Formulário de captura
        </h1>
        <p style={{ color: "var(--via-text-body)" }}>
          Os campos deste formulário são configurados em Configurações · Captura de Leads.
          Ao enviar, ele cria o contato e o negócio e dispara a automação vinculada.
        </p>
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Formulário <span className="font-mono">{slug}</span> · esta tela entra no Sprint 5.
        </p>
      </div>
    </div>
  );
}
