import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompleteSetup, useOrganization, useSaveSetupStep, useSetupProgress } from "@/hooks/useSetup";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";

const PROXIMOS_PASSOS = [
  { label: "Cadastre seus produtos", to: "/products" },
  { label: "Importe seus contatos", to: "/contacts" },
  { label: "Revise a base de conhecimento da IA", to: "/settings" },
];

export function StepConcluido() {
  const navigate = useNavigate();
  const { data: org } = useOrganization();
  const { data: progresso } = useSetupProgress();
  const { data: whatsapp } = useWhatsAppSetup();
  const concluir = useCompleteSetup();
  const salvarEtapa = useSaveSetupStep();

  const feitos = new Set(progresso?.completed_steps ?? []);
  // O resumo reflete o que foi realmente feito, não o que o wizard esperava.
  // Marcar canal como pronto quando o usuário pulou seria mentir na cara dele.
  const conquistas = [
    { label: "Empresa configurada", ok: feitos.has("empresa") && feitos.has("publico") },
    { label: "IA criada com o perfil da sua marca", ok: feitos.has("ia") },
    { label: "Pipeline de vendas definido", ok: feitos.has("pipeline") },
    { label: "Canal de atendimento conectado", ok: !!whatsapp?.configured },
  ];

  const irParaDashboard = async () => {
    try {
      await salvarEtapa.mutateAsync({ step: "concluido" });
      await concluir.mutateAsync();
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir o setup.");
    }
  };

  return (
    <div className="space-y-6 text-center">
      <PartyPopper className="mx-auto h-10 w-10" strokeWidth={1.5} style={{ color: "var(--via-navy)" }} />

      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          {org?.name ? `${org.name} está pronta!` : "Sua plataforma está pronta!"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Tudo o que você configurou pode ser ajustado depois em Configurações.
        </p>
      </div>

      <ul className="mx-auto max-w-sm space-y-2 text-left">
        {conquistas.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-sm">
            <CheckCircle2
              className="h-4 w-4 shrink-0"
              strokeWidth={1.5}
              style={{ color: c.ok ? "var(--via-success)" : "var(--via-text-muted)" }}
            />
            <span style={{ color: c.ok ? "var(--via-text-primary)" : "var(--via-text-muted)" }}>
              {c.label}
              {!c.ok && " — pendente"}
            </span>
          </li>
        ))}
      </ul>

      <div className="mx-auto max-w-sm space-y-2 text-left">
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Próximos passos sugeridos
        </p>
        {PROXIMOS_PASSOS.map((p) => (
          <button
            key={p.to}
            type="button"
            onClick={() => navigate(p.to)}
            className="flex w-full items-center gap-2 text-sm hover:underline"
            style={{ color: "var(--via-text-body)" }}
          >
            <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            {p.label}
          </button>
        ))}
      </div>

      <Button
        onClick={irParaDashboard}
        disabled={concluir.isPending || salvarEtapa.isPending}
        data-testid="setup-finish"
      >
        {concluir.isPending ? "Finalizando…" : "Ir para o Dashboard"}
      </Button>
    </div>
  );
}
