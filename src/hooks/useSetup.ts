import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type SetupProgress = Database["public"]["Tables"]["setup_progress"]["Row"];

/**
 * Etapas do wizard, na ordem em que aparecem.
 *
 * `peso` existe porque as etapas não valem o mesmo: sem canal conectado a IA
 * não atende ninguém, enquanto as demais só deixam o atendimento mais genérico.
 * Esconder essa diferença fazia o usuário pular a única que realmente bloqueia.
 */
export const SETUP_STEPS = [
  { key: "voce", label: "Você", peso: "personalizacao" },
  { key: "empresa", label: "Empresa", peso: "melhora_ia" },
  { key: "publico", label: "Público", peso: "melhora_ia" },
  { key: "ia", label: "IA", peso: "melhora_ia" },
  { key: "voz", label: "Voz", peso: "personalizacao" },
  { key: "pipeline", label: "Pipeline", peso: "personalizacao" },
  { key: "canal", label: "Canal", peso: "essencial" },
  { key: "concluido", label: "Pronto", peso: "personalizacao" },
] as const;

/** Rótulo curto do peso, usado como badge no cabeçalho da etapa. */
export const PESO_LABEL: Record<string, string> = {
  essencial: "Essencial para atender",
  melhora_ia: "Melhora a IA",
  personalizacao: "Personalização",
};

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];

/**
 * Uma etapa pulada é registrada como `pulado:<etapa>` no mesmo array de
 * `completed_steps`. Assim o wizard sabe que o usuário passou por ali sem que o
 * checklist final minta dizendo que a etapa está pronta.
 */
export const SKIPPED_PREFIX = "pulado:";

export function etapaConcluida(steps: string[] | null | undefined, key: SetupStepKey): boolean {
  return (steps ?? []).includes(key);
}

export function etapaPulada(steps: string[] | null | undefined, key: SetupStepKey): boolean {
  return (steps ?? []).includes(`${SKIPPED_PREFIX}${key}`);
}

/** Faixas de tamanho da empresa (organizations.company_size). */
export const COMPANY_SIZES = [
  { value: "so_eu", label: "Só eu" },
  { value: "2-5", label: "2–5 pessoas" },
  { value: "6-20", label: "6–20 pessoas" },
  { value: "21-50", label: "21–50 pessoas" },
  { value: "51-200", label: "51–200 pessoas" },
  { value: "200+", label: "Mais de 200" },
] as const;

export const BUSINESS_SECTORS = [
  { value: "imobiliario", label: "Imobiliário", icon: "🏠" },
  { value: "saude", label: "Saúde", icon: "🏥" },
  { value: "educacao", label: "Educação", icon: "📚" },
  { value: "varejo", label: "Varejo", icon: "🛍️" },
  { value: "servicos", label: "Serviços", icon: "⚙️" },
  { value: "tecnologia", label: "Tecnologia", icon: "💻" },
  { value: "juridico", label: "Jurídico", icon: "⚖️" },
  { value: "financeiro", label: "Financeiro", icon: "💰" },
  { value: "alimentacao", label: "Alimentação", icon: "🍕" },
  { value: "beleza", label: "Beleza", icon: "💅" },
  { value: "outro", label: "Outro", icon: "📦" },
] as const;

export const BRAND_TONES = [
  { value: "profissional", label: "Profissional", exemplo: "Podemos agendar uma reunião para apresentar nossa proposta?" },
  { value: "consultivo", label: "Consultivo", exemplo: "Me conta mais sobre o que você precisa — assim consigo te ajudar melhor." },
  { value: "amigavel", label: "Amigável", exemplo: "Oi! Que bom falar com você. Me conta o que está buscando? 😊" },
  { value: "tecnico", label: "Técnico", exemplo: "Nossa solução utiliza arquitetura em microsserviços com SLA de 99,9%." },
  { value: "descontraido", label: "Descontraído", exemplo: "E aí! Bora resolver isso juntos? Me fala o que tá rolando." },
] as const;

/** Etapas de pipeline sugeridas por setor. */
export const PIPELINE_BY_SECTOR: Record<string, string[]> = {
  imobiliario: ["Prospecção", "Qualificação", "Visita agendada", "Proposta", "Negociação", "Fechamento"],
  saude: ["Contato inicial", "Consulta agendada", "Avaliação", "Proposta de tratamento", "Em tratamento", "Alta"],
  educacao: ["Lead", "Interesse confirmado", "Visita/Demo", "Matrícula", "Aluno ativo"],
  varejo: ["Lead", "Orçamento", "Proposta", "Negociação", "Fechamento"],
  servicos: ["Prospecção", "Diagnóstico", "Proposta", "Contrato", "Em execução", "Entregue"],
  tecnologia: ["MQL", "SQL", "Demo", "Proposta", "Negociação", "Fechamento"],
  juridico: ["Consulta inicial", "Análise do caso", "Proposta de honorários", "Contrato assinado", "Em andamento"],
  financeiro: ["Lead", "Qualificação", "Análise", "Proposta", "Fechamento"],
  alimentacao: ["Contato", "Degustação/Visita", "Proposta", "Negociação", "Fechamento"],
  beleza: ["Agendamento", "Atendimento", "Pós-atendimento", "Fidelização"],
  outro: ["Prospecção", "Qualificação", "Proposta", "Negociação", "Fechamento"],
};

const LOSS_REASONS_DEFAULT = [
  "Preço acima do orçamento",
  "Escolheu concorrente",
  "Não era o momento certo",
  "Sem resposta",
  "Fora do perfil",
];

export const LOSS_REASONS_BY_SECTOR: Record<string, string[]> = {
  imobiliario: ["Preço acima do orçamento", "Não encontrou o imóvel ideal", "Escolheu outra imobiliária", "Financiamento não aprovado", "Desistiu da compra"],
  saude: ["Preço", "Escolheu outro profissional", "Não tinha disponibilidade", "Plano de saúde não cobre"],
  educacao: ["Preço da mensalidade", "Escolheu outra instituição", "Mudou de planos", "Não passou na avaliação"],
  juridico: ["Honorários acima do esperado", "Escolheu outro escritório", "Desistiu da ação", "Caso fora da área de atuação"],
  tecnologia: ["Preço", "Escolheu concorrente", "Faltou funcionalidade", "Projeto adiado", "Sem budget aprovado"],
};

export function lossReasonsForSector(sector: string | null | undefined): string[] {
  return LOSS_REASONS_BY_SECTOR[sector ?? ""] ?? LOSS_REASONS_DEFAULT;
}

export function pipelineForSector(sector: string | null | undefined): string[] {
  return PIPELINE_BY_SECTOR[sector ?? ""] ?? PIPELINE_BY_SECTOR.outro;
}

/** Organização atual, com todo o contexto coletado no setup. */
export function useOrganization() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["organization", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Organization | null> => {
      const { data, error } = await supabase
        .from("organizations").select("*").eq("id", orgId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Atualiza o contexto da organização FORA do wizard (Configurações > Geral >
 * Sobre a empresa e Configurações > IA > tom/proibições/exemplo). Mesmo
 * registro que o onboarding grava — fonte única, não cópia.
 */
export function useUpdateOrganization() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<Database["public"]["Tables"]["organizations"]["Update"]>) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase
        .from("organizations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization", orgId] }),
  });
}

/**
 * Progresso do wizard. A linha é criada na primeira leitura — assim o wizard
 * não precisa se preocupar em existir antes de gravar o primeiro passo.
 */
export function useSetupProgress() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["setup-progress", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<SetupProgress | null> => {
      const { data } = await supabase
        .from("setup_progress").select("*").eq("org_id", orgId!).maybeSingle();
      if (data) return data;

      const { data: criado, error } = await supabase
        .from("setup_progress")
        .insert({ org_id: orgId!, completed_steps: [], current_step: SETUP_STEPS[0].key })
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return criado;
    },
  });
}

/** Salva contexto na organização e marca a etapa como concluída. */
export function useSaveSetupStep() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      step,
      patch,
    }: {
      step: SetupStepKey;
      patch?: Partial<Database["public"]["Tables"]["organizations"]["Update"]>;
    }) => {
      if (!orgId) throw new Error("Organização não carregada.");

      if (patch && Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("organizations")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", orgId);
        if (error) throw error;
      }

      const { data: atual } = await supabase
        .from("setup_progress").select("completed_steps").eq("org_id", orgId).maybeSingle();
      const feitos = new Set(atual?.completed_steps ?? []);
      feitos.add(step);

      // Próxima etapa da lista; na última, fica nela mesma.
      const i = SETUP_STEPS.findIndex((s) => s.key === step);
      const proxima = SETUP_STEPS[Math.min(i + 1, SETUP_STEPS.length - 1)].key;

      const { error } = await supabase
        .from("setup_progress")
        .upsert(
          {
            org_id: orgId,
            completed_steps: [...feitos],
            current_step: proxima,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "org_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setup-progress", orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
    },
  });
}

/**
 * Registra a etapa como PULADA e avança.
 *
 * Nada é gravado na organização: pular tem que ser inócuo, não meio-salvo com
 * campos vazios sobrescrevendo o que já existia.
 */
export function useSkipSetupStep() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ step }: { step: SetupStepKey }) => {
      if (!orgId) throw new Error("Organização não carregada.");

      const { data: atual } = await supabase
        .from("setup_progress").select("completed_steps").eq("org_id", orgId).maybeSingle();

      // Pular remove a marca de concluída: refazer o onboarding e pular uma
      // etapa antes concluída não pode deixar o checklist dizendo "pronto".
      const marcas = new Set((atual?.completed_steps ?? []).filter((s) => s !== step));
      marcas.add(`${SKIPPED_PREFIX}${step}`);

      const i = SETUP_STEPS.findIndex((s) => s.key === step);
      const proxima = SETUP_STEPS[Math.min(i + 1, SETUP_STEPS.length - 1)].key;

      const { error } = await supabase.from("setup_progress").upsert(
        {
          org_id: orgId,
          completed_steps: [...marcas],
          current_step: proxima,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["setup-progress", orgId] }),
  });
}

/**
 * Reabre o assistente do começo (Configurações > Onboarding > Refazer).
 *
 * Zera SÓ o progresso do wizard (`setup_progress`). `organizations.setup_completed`
 * fica intacto de propósito: o guard do ProtectedRoute usa esse campo, e limpá-lo
 * prenderia todos os admins da organização dentro do wizard de novo.
 */
export function useResetSetup() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase.from("setup_progress").upsert(
        {
          org_id: orgId,
          completed_steps: [],
          current_step: SETUP_STEPS[0].key,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      // O SetupPage lê o passo atual do cache ao montar; escrever antes de
      // invalidar evita ele abrir na última etapa enquanto o refetch está em voo.
      queryClient.setQueryData(
        ["setup-progress", orgId],
        (anterior: Record<string, unknown> | undefined) =>
          anterior ? { ...anterior, completed_steps: [], current_step: SETUP_STEPS[0].key } : anterior,
      );
      queryClient.invalidateQueries({ queryKey: ["setup-progress", orgId] });
    },
  });
}

/** Cores das etapas, do início ao fim do funil. Mesma escala do seed do Sprint 1. */
const STAGE_COLORS = ["#0A1F3B", "#1E3A5F", "#2A4A6E", "#667085", "#1F8A5B", "#0F766E"];

/**
 * Aplica o pipeline escolhido no wizard.
 *
 * REGRA DE SEGURANÇA: só substitui as etapas se a organização não tiver nenhum
 * negócio. Apagar etapa com deal dentro deixaria os negócios órfãos de etapa e
 * sumindo do kanban — perda de dado real por causa de um wizard de configuração.
 * Havendo negócios, as etapas existentes são RENOMEADAS na ordem e as que
 * sobrarem na sugestão são acrescentadas ao fim. Nada é apagado.
 */
export function useApplyPipeline() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ stages, lossReasons }: { stages: string[]; lossReasons: string[] }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (stages.length === 0) throw new Error("Defina ao menos uma etapa.");

      const [{ count: totalDeals }, { data: pipeline }] = await Promise.all([
        supabase.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        supabase.from("pipelines").select("id").eq("org_id", orgId)
          .order("is_default", { ascending: false }).limit(1).maybeSingle(),
      ]);

      let pipelineId = pipeline?.id;
      if (!pipelineId) {
        const { data: criado, error } = await supabase
          .from("pipelines")
          .insert({ org_id: orgId, name: "Pipeline principal", is_default: true })
          .select("id").single();
        if (error) throw error;
        pipelineId = criado.id;
      }

      const { data: existentes } = await supabase
        .from("pipeline_stages")
        .select("id, order")
        .eq("pipeline_id", pipelineId)
        .order("order");

      const atuais = existentes ?? [];
      const temDeals = (totalDeals ?? 0) > 0;

      const linha = (nome: string, i: number) => ({
        org_id: orgId,
        pipeline_id: pipelineId!,
        name: nome,
        order: i,
        color: STAGE_COLORS[Math.min(i, STAGE_COLORS.length - 1)],
        // Probabilidade cresce ao longo do funil; a última etapa fecha em 100%.
        win_probability: Math.round(((i + 1) / stages.length) * 100),
      });

      if (!temDeals) {
        if (atuais.length > 0) {
          const { error } = await supabase
            .from("pipeline_stages").delete().eq("pipeline_id", pipelineId);
          if (error) throw error;
        }
        const { error } = await supabase.from("pipeline_stages").insert(stages.map(linha));
        if (error) throw error;
      } else {
        // Renomeia posicionalmente o que já existe.
        for (let i = 0; i < Math.min(atuais.length, stages.length); i++) {
          const { error } = await supabase
            .from("pipeline_stages")
            .update({ name: stages[i], order: i })
            .eq("id", atuais[i].id);
          if (error) throw error;
        }
        // Acrescenta as etapas que a sugestão tem a mais.
        if (stages.length > atuais.length) {
          const extras = stages.slice(atuais.length).map((nome, k) => linha(nome, atuais.length + k));
          const { error } = await supabase.from("pipeline_stages").insert(extras);
          if (error) throw error;
        }
      }

      // Motivos de perda: só os que ainda não existem, para não duplicar quem
      // já rodou o wizard antes.
      const { data: motivosAtuais } = await supabase
        .from("loss_reasons").select("label").eq("org_id", orgId);
      const jaTem = new Set((motivosAtuais ?? []).map((m) => m.label));
      const novos = lossReasons.filter((l) => l.trim() && !jaTem.has(l.trim()));
      if (novos.length > 0) {
        const base = motivosAtuais?.length ?? 0;
        const { error } = await supabase.from("loss_reasons").insert(
          novos.map((label, i) => ({ org_id: orgId, label: label.trim(), order: base + i })),
        );
        if (error) throw error;
      }

      return { substituiu: !temDeals, etapas: stages.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stages"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

/** Quantos negócios a org tem — decide se o pipeline pode ser substituído. */
export function useDealCount() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["deal-count", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Fecha o setup: a partir daqui o guard para de redirecionar. */
export function useCompleteSetup() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { error } = await supabase
        .from("organizations")
        .update({
          setup_completed: true,
          setup_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Escreve no cache ANTES de invalidar, e isso não é otimização.
      //
      // invalidateQueries marca a query como obsoleta mas não espera o refetch.
      // Quem chama esta mutation navega para /dashboard na linha seguinte, e o
      // ProtectedRoute renderiza lendo o cache — que ainda traria
      // setup_completed: false. O guard então devolvia o usuário para /setup,
      // logo depois de ele concluir o onboarding. Coberto por
      // e2e/setup-wizard.spec.ts ("passo 6 conclui o setup").
      queryClient.setQueryData(
        ["organization", orgId],
        (anterior: Record<string, unknown> | undefined) =>
          anterior ? { ...anterior, setup_completed: true } : anterior,
      );
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
      queryClient.invalidateQueries({ queryKey: ["setup-progress", orgId] });
    },
  });
}
