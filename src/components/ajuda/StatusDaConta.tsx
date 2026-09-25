import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useSetupChecklist } from "@/hooks/useSetupChecklist";
import { useEmailConnection } from "@/hooks/useEmailConnection";
import { useCalendarStatus } from "@/hooks/useAgenda";
import { useCredenciaisCadastradas } from "@/components/settings/CredenciaisServico";

type Item = { rotulo: string; ok: boolean; detalhe: string; to: string; testId: string };

function useContagens() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ajuda-contagens", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async () => {
      const contar = async (tabela: "knowledge_facts" | "knowledge_documents" | "products" | "contacts" | "automations") => {
        const { count } = await supabase.from(tabela).select("id", { count: "exact", head: true }).eq("org_id", orgId!);
        return count ?? 0;
      };
      const [fatos, docs, produtos, contatos, automacoes] = await Promise.all([
        contar("knowledge_facts"), contar("knowledge_documents"), contar("products"), contar("contacts"), contar("automations"),
      ]);
      return { conhecimento: fatos + docs, produtos, contatos, automacoes };
    },
  });
}

/**
 * "O que já está pronto na sua conta": o estado real, lido do banco, com o link
 * para resolver cada pendência. A Ajuda deixa de ser genérica e passa a dizer o
 * próximo passo daquela empresa.
 */
export function StatusDaConta() {
  const checklist = useSetupChecklist();
  const { data: gmail } = useEmailConnection();
  const { data: calendario } = useCalendarStatus();
  const { data: chaves } = useCredenciaisCadastradas(["resend", "twilio_account_sid", "twilio_auth_token", "elevenlabs"]);
  const { data: n, isLoading } = useContagens();

  if (isLoading || !n) return <Skeleton className="h-40 w-full" />;

  const itens: Item[] = [
    { rotulo: "Canal de atendimento", ok: !!checklist.canal.ok, detalhe: checklist.canal.ok ? "Conectado" : "Sem canal a IA não atende", to: "/settings/integrations?integration=channels", testId: "status-canal" },
    { rotulo: "IA ativa", ok: !!checklist.ia.ok, detalhe: checklist.ia.ok ? "Atendendo" : checklist.ia.detalhe ?? "Desligada", to: "/settings/ia", testId: "status-ia" },
    { rotulo: "Base de conhecimento", ok: n.conhecimento > 0, detalhe: n.conhecimento > 0 ? `${n.conhecimento} fatos e documentos` : "Vazia: a IA não tem de onde tirar preço e prazo", to: "/settings/ia?aba=knowledge", testId: "status-conhecimento" },
    { rotulo: "Funil de vendas", ok: !!checklist.pipeline.ok, detalhe: checklist.pipeline.ok ? "Etapas definidas" : "Revise as etapas", to: "/settings/automations?secao=funil", testId: "status-funil" },
    { rotulo: "Produtos/Serviços", ok: n.produtos > 0, detalhe: n.produtos > 0 ? `${n.produtos} cadastrados` : "Nenhum cadastrado", to: "/products", testId: "status-produtos" },
    { rotulo: "E-mail", ok: !!gmail || !!chaves?.resend, detalhe: gmail ? "Gmail conectado" : chaves?.resend ? "Resend com chave" : "Não conectado", to: "/settings/integrations?integration=gmail", testId: "status-email" },
    { rotulo: "Seu calendário", ok: !!calendario?.integration, detalhe: calendario?.integration ? "Conectado" : "Não conectado", to: "/settings/agenda", testId: "status-calendario" },
    { rotulo: "Voz e ligações", ok: !!chaves?.twilio_account_sid && !!chaves?.twilio_auth_token && !!chaves?.elevenlabs, detalhe: chaves?.twilio_account_sid ? "Credenciais cadastradas" : "Opcional, não configurado", to: "/voz", testId: "status-voz" },
    { rotulo: "Automações", ok: n.automacoes > 0, detalhe: n.automacoes > 0 ? `${n.automacoes} criadas` : "Nenhuma ainda", to: "/settings/automations", testId: "status-automacoes" },
  ];
  const prontos = itens.filter((i) => i.ok).length;

  return (
    <section className="via-card space-y-4 p-5" data-testid="ajuda-status">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-medium" style={{ color: "var(--via-text-primary)" }}>Sua conta hoje</h2>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>O que já está funcionando e o próximo passo de cada item.</p>
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{prontos} de {itens.length} prontos</p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--via-border)" }}>
        <div className="h-full rounded-full" style={{ width: `${(prontos / itens.length) * 100}%`, background: "var(--via-success)" }} />
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((i) => (
          <li key={i.rotulo}>
            <Link to={i.to} className="flex items-start gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50" style={{ borderColor: "var(--via-border)" }} data-testid={i.testId}>
              {i.ok
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-success)" }} />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />}
              <span className="min-w-0">
                <span className="block text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{i.rotulo}</span>
                <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>{i.detalhe}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
