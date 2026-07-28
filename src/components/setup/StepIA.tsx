import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganization, useSaveSetupStep } from "@/hooks/useSetup";
import {
  PROMPT_BLOCKS, joinBlocks, splitBlocks, useGenerateSystemPrompt,
  type FaqGerada, type ObjecaoGerada,
} from "@/hooks/useGenerateSystemPrompt";
import { useImportFAQs, useImportObjections, useUpsertAIConfig } from "@/hooks/useAIConfig";

export function StepIA({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data: org } = useOrganization();
  const gerar = useGenerateSystemPrompt();
  const upsertConfig = useUpsertAIConfig();
  const importarFaqs = useImportFAQs();
  const importarObjecoes = useImportObjections();
  const salvarEtapa = useSaveSetupStep();

  const [agentName, setAgentName] = useState("Assistente");
  const [blocos, setBlocos] = useState<Record<string, string> | null>(null);
  const [faqs, setFaqs] = useState<FaqGerada[]>([]);
  const [objecoes, setObjecoes] = useState<ObjecaoGerada[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Gera uma vez ao entrar na etapa. Regerar é ação explícita — a geração custa
  // uma chamada ao modelo e o usuário pode já ter editado os blocos.
  useEffect(() => {
    if (!org || blocos || gerar.isPending) return;
    void executarGeracao(agentName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org]);

  const executarGeracao = async (nome: string) => {
    setErro(null);
    try {
      const resultado = await gerar.mutateAsync(nome);
      setBlocos(splitBlocks(resultado.system_prompt));
      setFaqs(resultado.faqs);
      setObjecoes(resultado.objections);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o prompt.");
    }
  };

  const salvarEAvancar = async () => {
    if (!blocos) return;
    setSalvando(true);
    try {
      // O upsert cuida do versionamento: prompt novo incrementa prompt_version
      // e grava em ai_prompt_versions com a nota abaixo.
      await upsertConfig.mutateAsync({
        agent_name: agentName.trim() || "Assistente",
        agent_tone: org?.brand_tone ?? "profissional",
        agent_objective: org?.main_problem_solved ?? "",
        system_prompt: joinBlocks(blocos),
        versionNote: "Gerado no setup inicial",
      });

      // Base de conhecimento de partida. Falhar aqui não desfaz o prompt — o
      // usuário pode adicionar FAQs manualmente depois, mas perder o prompt
      // gerado o obrigaria a refazer a etapa inteira.
      if (faqs.length) await importarFaqs.mutateAsync(faqs);
      if (objecoes.length) await importarObjecoes.mutateAsync(objecoes);

      await salvarEtapa.mutateAsync({ step: "ia" });
      onNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a configuração da IA.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          O perfil da sua IA
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Geramos a partir do que você contou. Revise e ajuste o que quiser — tudo é editável depois.
        </p>
      </div>

      <div className="space-y-2 sm:max-w-xs">
        <Label htmlFor="agent-name">Nome do agente</Label>
        <Input
          id="agent-name"
          data-testid="setup-agent-name"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="Sofia"
        />
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          É o nome que aparece nas mensagens enviadas pela IA.
        </p>
      </div>

      {gerar.isPending && (
        <div className="via-card space-y-3 p-5" data-testid="setup-ia-loading">
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            Gerando o perfil da sua IA…
          </p>
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Estamos escrevendo persona, filosofia de atendimento, regras e exemplos
            específicos do seu setor. Leva alguns segundos.
          </p>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {erro && !gerar.isPending && (
        <div className="via-card space-y-3 p-5" data-testid="setup-ia-error">
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-coral, #dc2626)" }}>
            <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
            Não foi possível gerar
          </p>
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{erro}</p>
          <Button variant="outline" className="gap-1.5" onClick={() => executarGeracao(agentName)}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            Tentar de novo
          </Button>
        </div>
      )}

      {blocos && !gerar.isPending && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Perfil gerado
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => executarGeracao(agentName)}
              disabled={gerar.isPending}
              data-testid="setup-regenerate"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              Gerar de novo
            </Button>
          </div>

          <div className="via-scroll max-h-[45vh] space-y-3 pr-1">
            {PROMPT_BLOCKS.map(({ key, label, icon }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`bloco-${key}`} className="flex items-center gap-1.5">
                  <span aria-hidden>{icon}</span>
                  {label}
                </Label>
                <Textarea
                  id={`bloco-${key}`}
                  data-testid={`setup-block-${key}`}
                  rows={key === "sector_context" || key === "examples" ? 6 : 4}
                  value={blocos[key] ?? ""}
                  onChange={(e) => setBlocos({ ...blocos, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          {(faqs.length > 0 || objecoes.length > 0) && (
            <div className="via-card p-4">
              <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                Base de conhecimento de partida
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
                {faqs.length} pergunta(s) frequente(s) e {objecoes.length} objeção(ões) do seu setor
                serão adicionadas. Você revisa e edita em Configurações &gt; IA.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={salvando}>Voltar</Button>
        <Button
          onClick={salvarEAvancar}
          disabled={!blocos || salvando || gerar.isPending}
          data-testid="setup-next"
        >
          {salvando ? "Salvando…" : "Parece bom, avançar"}
        </Button>
      </div>
    </div>
  );
}
