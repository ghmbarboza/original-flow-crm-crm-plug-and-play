import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, PartyPopper, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompleteSetup, useOrganization, useSaveSetupStep, useSetupProgress } from "@/hooks/useSetup";
import { useSetupChecklist } from "@/hooks/useSetupChecklist";
import { useDemoStatus, useSeedDemo } from "@/hooks/useDemoData";

/**
 * Próximos passos na ordem em que rendem mais rápido: o que a IA sabe, quem já
 * é cliente, o que se vende, e depois agenda e telefone. Cada link cai na tela
 * exata (aba certa já aberta), não numa Configurações genérica.
 */
const PROXIMOS_PASSOS = [
  { label: "Ensine a IA: suba documentos e fatos da empresa", to: "/settings/ia?aba=knowledge" },
  { label: "Traga contatos e negócios de outro CRM ou planilha", to: "/settings/importacao" },
  { label: "Cadastre seus Produtos/Serviços", to: "/products" },
  { label: "Conecte seu calendário e deixe a IA marcar reuniões", to: "/settings/agenda" },
  { label: "Ligações por telefone com a IA (Twilio e ElevenLabs)", to: "/settings/integrations?integration=twilio" },
];

export function StepConcluido({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const { data: org } = useOrganization();
  const { data: progresso } = useSetupProgress();
  const checklist = useSetupChecklist();
  const concluir = useCompleteSetup();
  const salvarEtapa = useSaveSetupStep();
  const { data: demo } = useDemoStatus();
  const semear = useSeedDemo();

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
      to: "/settings/automations?secao=funil",
      onde: "Configurações > Automações > Funil",
    },
    {
      label: "Canal de atendimento conectado",
      ...checklist.canal,
      to: "/settings/integrations?integration=channels",
      onde: "Configurações > Integrações > Canais",
    },
  ];

  // Navegar para uma tela do app fecha o modal — o link é o destino, não o wizard.
  const irPara = (to: string) => {
    onClose?.();
    navigate(to);
  };

  const canalPronto = !!checklist.canal.ok;
  const temDemo = demo === true;
  const ocupado = concluir.isPending || salvarEtapa.isPending || semear.isPending;

  const finalizar = async () => {
    await salvarEtapa.mutateAsync({ step: "concluido" });
    await concluir.mutateAsync();
    onClose?.();
  };

  // Ao concluir, o cliente cai onde a plataforma já está viva: no atendimento se
  // o canal está conectado, senão no painel.
  const irParaDashboard = async () => {
    try {
      await finalizar();
      navigate(canalPronto ? "/whatsapp" : "/dashboard", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir o setup.");
    }
  };

  // Sem histórico ainda, a plataforma vazia não mostra o que faz. Os dados de
  // exemplo (marcados, removíveis em Configurações > Primeiros passos) preenchem
  // contatos, negócios, atividades e produtos para o primeiro passeio.
  const concluirComExemplo = async () => {
    try {
      await semear.mutateAsync();
      await finalizar();
      toast.success("Dados de exemplo carregados. Remova quando quiser em Configurações > Primeiros passos.");
      navigate("/dashboard", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os dados de exemplo.");
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

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={irParaDashboard} disabled={ocupado} data-testid="setup-finish">
          {concluir.isPending ? "Finalizando…" : canalPronto ? "Concluir e abrir o atendimento" : "Concluir e ir para o painel"}
        </Button>
        {!temDemo && (
          <Button variant="outline" onClick={concluirComExemplo} disabled={ocupado} className="gap-1.5" data-testid="setup-finish-demo">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
            {semear.isPending ? "Carregando exemplo…" : "Concluir com dados de exemplo"}
          </Button>
        )}
      </div>

      <p className="mx-auto max-w-sm text-xs" style={{ color: "var(--via-text-muted)" }}>
        {canalPronto
          ? "Seu canal já está conectado: a próxima mensagem que chegar será atendida pela IA."
          : "Sem canal conectado a IA ainda não atende ninguém. É o primeiro item pendente acima."}
        {" "}Quer retomar o assistente depois? Configurações &gt; Primeiros passos &gt; “Refazer onboarding”
        reabre estas etapas com os dados atuais já preenchidos.
      </p>
    </div>
  );
}
