import { BrainCircuit } from "lucide-react";
import { IntegrationCard } from "@/components/settings/IntegrationCard";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import {
  CredenciaisServico, useCredenciaisCadastradas, type CampoCredencial,
} from "@/components/settings/CredenciaisServico";

// Mesma ordem de preferência do servidor (SERVICOS_DE_IA em
// supabase/functions/_shared/ai.ts): a primeira chave cadastrada é a usada.
const PROVEDORES: Array<CampoCredencial & { nome: string }> = [
  { service: "anthropic", nome: "Anthropic (Claude)", label: "Chave da Anthropic (Claude)", secreto: true, placeholder: "sk-ant-..." },
  { service: "openai", nome: "OpenAI (GPT)", label: "Chave da OpenAI (GPT)", secreto: true, placeholder: "sk-..." },
  { service: "gemini", nome: "Google (Gemini)", label: "Chave do Google (Gemini)", secreto: true, placeholder: "AIza..." },
];
const SERVICOS = PROVEDORES.map((p) => p.service);

/**
 * Configurações > Integrações > Inteligência artificial.
 *
 * Sem chave própria, a IA roda pela plataforma. Com chave própria, ela vem
 * primeiro e a plataforma fica de reserva: se o provedor falhar, a resposta
 * sai pelo próximo da fila.
 */
export function ProvedoresIACard({ abrirPorPadrao }: { abrirPorPadrao: boolean }) {
  const { data: cadastradas } = useCredenciaisCadastradas(SERVICOS);
  const emUso = PROVEDORES.filter((p) => cadastradas?.[p.service]);
  const fila = [...emUso.map((p) => p.nome), "IA da plataforma (reserva)"];

  return (
    <IntegrationCard
      icon={BrainCircuit}
      title="IA: provedor e reserva"
      purpose="Qual IA responde seus clientes. Com chave própria você escolhe o modelo, e a IA da plataforma fica de reserva."
      recomendacao="opcional"
      status="ok"
      statusLabel={emUso.length > 0 ? `Chave própria: ${emUso.map((p) => p.nome).join(", ")}` : "IA da plataforma"}
      abrirPorPadrao={abrirPorPadrao}
      testId="integration-ia"
    >
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          A IA já funciona sem configurar nada. Se você cadastrar uma chave, ela passa a ser usada
          primeiro. Quando o provedor falha, fica sem crédito ou atinge o limite, a resposta sai pelo
          próximo da lista, para o atendimento não parar.
        </p>
        <div className="space-y-1" data-testid="integration-ia-fila">
          <p className="text-xs font-medium" style={{ color: "var(--via-text-muted)" }}>Ordem de uso hoje</p>
          <ol className="list-decimal pl-5 text-sm" style={{ color: "var(--via-text-primary)" }}>
            {fila.map((nome) => <li key={nome}>{nome}</li>)}
          </ol>
        </div>
        <CredenciaisServico campos={PROVEDORES} testIdPrefix="integration-ia" mensagemSalvo="Chave de IA guardada no Vault." />
        <div className="flex flex-wrap items-center gap-3">
          {PROVEDORES.map((p) => <ApiKeyTutorialDialog key={p.service} service={p.service} rotulo={`Como obter a chave: ${p.nome}`} />)}
        </div>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          O uso da chave própria é cobrado pelo provedor, na sua conta. Para remover uma chave, use a
          lista de chaves no fim desta página.
        </p>
      </div>
    </IntegrationCard>
  );
}
