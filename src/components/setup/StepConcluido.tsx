import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompleteSetup, useOrganization, useSaveSetupStep, useSetupProgress } from "@/hooks/useSetup";
import { useSetupChecklist } from "@/hooks/useSetupChecklist";

const PROXIMOS_PASSOS = [
  { label: "Cadastre seus produtos", to: "/products" },
  { label: "Importe seus contatos", to: "/contacts" },
  { label: "Revise a base de conhecimento da IA", to: "/settings" },
];

export function StepConcluido({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const { data: org } = useOrganization();
  const { data: progresso } = useSetupProgress();
  const checklist = useSetupChecklist();
  const concluir = useCompleteSetup();
  const salvarEtapa = useSaveSetupStep();

  const feitos = new Set(progresso?.completed_steps ?? []);
  // O checklist reflete o ESTADO REAL verificado no banco, não a passagem pela
  // etapa: instância de canal presa em "connecting" ou IA em rascunho apareciam
  // com check verde e o usuário só descobria a falha quando ninguém era atendido.
  // Cada item pendente leva ao lugar exato onde se resolve.
  const conquistas = [
    {
      label: "Empresa configurada",
      detalhe: undefined as string | undefined,
      ok: !!org?.name?.trim() && !!org?.business_sector && feitos.has("empresa") && feitos.has("publico"),
      to: "/settings",
      onde: "Configurações > Geral",
    },
    {
      label: "IA criada com o perfil da sua marca",
      ...checklist.ia,
      to: "/settings/ia",
      onde: "Configurações > IA",
    },
    {
      label: "Voz da agente configurada",
      ...checklist.voz,
      to: "/settings/ia",
      onde: "Configurações > IA (Voz da agente)",
    },
    {
      label: "Pipeline de vendas definido",
      ...checklist.pipeline,
      to: "/settings/pipeline",
      onde: "Configurações > Pipeline",
    },
    {
      label: "Canal de atendimento conectado",
      ...checklist.canal,
      to: "/settings/channels",
      onde: "Configurações > Canais",
    },
  ];

  // Navegar para uma tela do app fecha o modal — o link é o destino, não o wizard.
  const irPara = (to: string) => {
    onClose?.();
    navigate(to);
  };

  const irParaDashboard = async () => {
    try {
      await salvarEtapa.mutateAsync({ step: "concluido" });
      await concluir.mutateAsync();
      onClose?.();
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
            {c.ok ? (
              <span style={{ color: "var(--via-text-primary)" }}>{c.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => irPara(c.to)}
                className="text-left hover:underline"
                style={{ color: "var(--via-text-muted)" }}
              >
                {c.detalhe ?? `${c.label} — pendente, configurar em ${c.onde}`}
              </button>
            )}
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
            onClick={() => irPara(p.to)}
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
        {concluir.isPending ? "Finalizando…" : "Concluir e usar a plataforma"}
      </Button>

      <p className="mx-auto max-w-sm text-xs" style={{ color: "var(--via-text-muted)" }}>
        Quer retomar o assistente depois? Configurações &gt; Onboarding &gt; “Refazer onboarding”
        reabre estas etapas com os dados atuais já preenchidos.
      </p>
    </div>
  );
}
