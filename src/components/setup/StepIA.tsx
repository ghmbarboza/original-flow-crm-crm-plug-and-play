import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
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
import { useAIConfig, useImportFAQs, useImportObjections, useUpsertAIConfig } from "@/hooks/useAIConfig";
import {
  contarPendencias, montarPromptRascunho, MARCA_PENDENTE, RASCUNHO_NOTA,
} from "@/lib/promptRascunho";
import { PularEtapa } from "@/components/setup/PularEtapa";

export function StepIA({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data: org } = useOrganization();
  const { data: configExistente, isLoading: carregandoConfig } = useAIConfig();
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
  // Rascunho = blocos montados localmente, sem IA. Muda o texto da tela, a nota
  // da versão e mantém a IA desativada ao salvar.
  const [rascunho, setRascunho] = useState(false);

  // Fonte única com Configurações > IA: se a org JÁ tem um prompt salvo
  // (refazendo o onboarding, ou o admin configurou antes), a etapa abre com o
  // que está no banco — nome do agente e blocos — em vez de gerar do zero.
  // Só gera com IA quando não existe nada, e a geração continua custando uma
  // chamada explícita ("Gerar de novo") a partir daí.
  useEffect(() => {
    if (!org || blocos || gerar.isPending || carregandoConfig) return;
    if (configExistente?.system_prompt?.trim()) {
      setAgentName(configExistente.agent_name ?? "Assistente");
      setBlocos(splitBlocks(configExistente.system_prompt));
      setRascunho(false);
      return;
    }
    void executarGeracao(agentName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, carregandoConfig]);

  const executarGeracao = async (nome: string) => {
    setErro(null);
    try {
      const resultado = await gerar.mutateAsync(nome);
      setBlocos(splitBlocks(resultado.system_prompt));
      setFaqs(resultado.faqs);
      setObjecoes(resultado.objections);
      setRascunho(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o prompt.");
    }
  };

  /**
   * Saída do beco sem saída: monta os blocos a partir do contexto dos passos 1 e
   * 2, sem chamar a IA. Não é substituto da geração — é o que impede o
   * onboarding de ficar intransponível quando o provedor não responde.
   */
  const montarRascunho = () => {
    setBlocos(montarPromptRascunho(org, agentName));
    setFaqs([]);
    setObjecoes([]);
    setRascunho(true);
    setErro(null);
  };

  const salvarEAvancar = async () => {
    if (!blocos) return;
    setSalvando(true);
    try {
      // O upsert cuida do versionamento: prompt novo incrementa prompt_version
      // e grava em ai_prompt_versions com a nota abaixo.
      //
      // `is_active: false` no rascunho é explícito de propósito. O default da
      // coluna já é false, mas deixar implícito faria a segurança do rascunho
      // depender de um default que alguém pode mudar. Um prompt que a IA não
      // escreveu não pode começar a atender cliente sozinho.
      await upsertConfig.mutateAsync({
        agent_name: agentName.trim() || "Assistente",
        agent_tone: org?.brand_tone ?? "profissional",
        agent_objective: org?.main_problem_solved ?? "",
        system_prompt: joinBlocks(blocos),
        versionNote: rascunho ? RASCUNHO_NOTA : "Gerado no setup inicial",
        ...(rascunho ? { is_active: false } : {}),
      });

      // Base de conhecimento de partida. Falhar aqui não desfaz o prompt — o
      // usuário pode adicionar FAQs manualmente depois, mas perder o prompt
      // gerado o obrigaria a refazer a etapa inteira.
      if (faqs.length) await importarFaqs.mutateAsync(faqs);
      if (objecoes.length) await importarObjecoes.mutateAsync(objecoes);

      await salvarEtapa.mutateAsync({ step: "ia" });
      if (rascunho) {
        toast.warning("Rascunho salvo. A IA fica desativada até você revisar em Configurações > IA.");
      }
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
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            Você não precisa parar aqui: dá para seguir com um rascunho montado a partir
            do que você já contou e ajustar depois.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => executarGeracao(agentName)}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              Tentar de novo
            </Button>
            <Button className="gap-1.5" onClick={montarRascunho} data-testid="setup-ia-rascunho">
              <FileText className="h-4 w-4" strokeWidth={1.5} />
              Continuar com um rascunho
            </Button>
          </div>
        </div>
      )}

      {blocos && !gerar.isPending && (
        <>
          {rascunho && (
            <div className="via-card space-y-2 p-4" data-testid="setup-ia-rascunho-aviso">
              <p className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                <FileText className="h-4 w-4" strokeWidth={1.5} />
                Rascunho — revise antes de ativar
              </p>
              <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
                Montamos a partir do que você contou, sem a IA. Os trechos marcados com{" "}
                <code className="rounded px-1 text-xs" style={{ background: "var(--via-surface-2, #00000010)" }}>
                  {MARCA_PENDENTE}
                </code>{" "}
                precisam do seu conhecimento do setor — é o que a IA teria escrito.
                {contarPendencias(blocos) > 0 && ` Faltam ${contarPendencias(blocos)} bloco(s).`}
              </p>
              <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
                A IA fica <strong>desativada</strong> até você revisar e ativar em
                Configurações &gt; IA. Você pode avançar agora e voltar depois.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              {rascunho ? "Rascunho do perfil" : "Perfil gerado"}
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
              {rascunho ? "Tentar gerar com IA" : "Gerar de novo"}
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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={salvando}>Voltar</Button>
        <PularEtapa
          step="ia"
          impacto="A IA fica desativada até você revisar em Configurações > IA. O resto da plataforma continua funcionando."
          onPulado={onNext}
          disabled={salvando}
        >
          <Button
            onClick={salvarEAvancar}
            disabled={!blocos || salvando || gerar.isPending}
            data-testid="setup-next"
          >
            {salvando ? "Salvando…" : rascunho ? "Avançar com o rascunho" : "Parece bom, avançar"}
          </Button>
        </PularEtapa>
      </div>
    </div>
  );
}
