import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";
import {
  progresso, realizado, type DadosMetas, type FiltrosMeta, type Metrica, type Periodo, type Progresso, type TipoPeriodo,
} from "@/lib/metas";

export type SalesGoal = Database["public"]["Tables"]["sales_goals"]["Row"];

/**
 * Valores aceitos por `sales_goals.assign_type`.
 *
 * O banco tem CHECK ('individual', 'team') desde a migration inicial, mas a
 * tela mandava "user" — então TODA meta individual falhava com violação de
 * constraint e o usuário via só "não foi possível criar a meta". As leituras
 * comparavam com "user" também, o que nunca era verdade.
 *
 * Constantes em vez de literais soltos: era a divergência entre dois lugares
 * escrevendo a mesma ideia com palavras diferentes que criou o defeito.
 */
export const ASSIGN_INDIVIDUAL = "individual" as const;
export const ASSIGN_TEAM = "team" as const;
export type AssignType = typeof ASSIGN_INDIVIDUAL | typeof ASSIGN_TEAM;

export interface MetaComProgresso extends SalesGoal {
  realizado: number | null;
  progresso: Progresso;
  filtros: FiltrosMeta;
}

// PostgREST devolve no máximo 1000 linhas por chamada: lê em páginas.
const PAGINA = 1000;
async function todasAsLinhas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return linhas;
  }
}

// Limites em horário de Brasília: o dia da meta é o dia do calendário de quem usa.
const inicioDoDia = (dia: string) => `${dia}T00:00:00-03:00`;
const fimDoDia = (dia: string) => `${dia}T23:59:59.999-03:00`;

type LinhaNegocio = {
  id: string; value: number | null; owner_id: string | null; status: string; contact_id: string | null;
  created_at: string; closed_at: string | null;
  stage: { pipeline_id: string } | null; contact: { source: string | null } | null;
};

/** Dados reais que as metas usam, entre o menor início e o maior fim das metas. */
async function carregarDados(orgId: string, inicio: string, fim: string): Promise<DadosMetas> {
  const de = inicioDoDia(inicio);
  const ate = fimDoDia(fim);
  const [negocios, contatos, atividades, conversas] = await Promise.all([
    // Negócio entra se foi criado ou fechado a partir do início, sem limite no
    // fim: "lead virou negócio" conta negócio aberto depois do período (até hoje),
    // e o resultado não pode depender de quais outras metas estão na tela.
    todasAsLinhas<LinhaNegocio>((a, b) => supabase.from("deals")
      .select("id, value, owner_id, status, contact_id, created_at, closed_at, stage:pipeline_stages(pipeline_id), contact:contacts(source)")
      .eq("org_id", orgId).or(`created_at.gte.${de},closed_at.gte.${de}`)
      .order("id").range(a, b) as unknown as PromiseLike<{ data: LinhaNegocio[] | null; error: { message: string } | null }>),
    todasAsLinhas<DadosMetas["contatos"][number]>((a, b) => supabase.from("contacts")
      .select("id, owner_id, created_at, source").eq("org_id", orgId).is("merged_into_id", null)
      .gte("created_at", de).lte("created_at", ate).order("id").range(a, b)),
    todasAsLinhas<DadosMetas["atividades"][number]>((a, b) => supabase.from("activities")
      .select("user_id, type, created_at").eq("org_id", orgId).neq("type", "stage_change")
      .gte("created_at", de).lte("created_at", ate).order("id").range(a, b)),
    todasAsLinhas<DadosMetas["conversas"][number]>((a, b) => supabase.from("conversations")
      .select("assigned_to, first_response_minutes, created_at").eq("org_id", orgId).not("first_response_minutes", "is", null)
      .gte("created_at", de).lte("created_at", ate).order("id").range(a, b)),
  ]);
  return {
    negocios: negocios.map((n) => ({
      id: n.id, value: n.value, owner_id: n.owner_id, status: n.status, contact_id: n.contact_id,
      created_at: n.created_at, closed_at: n.closed_at,
      pipeline_id: n.stage?.pipeline_id ?? null, origem: n.contact?.source ?? null,
    })),
    contatos, atividades, conversas,
  };
}

/**
 * Metas que têm algum dia dentro do período escolhido na tela, com o realizado
 * calculado no período de cada meta (uma meta trimestral aparece no mês, mas
 * mede o trimestre inteiro).
 */
export function useSalesGoals(periodo: Pick<Periodo, "inicio" | "fim">) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["sales-goals", orgId, periodo.inicio, periodo.fim],
    enabled: !!orgId,
    // O realizado vem de negócios, contatos e atividades que mudam em outras
    // telas sem invalidar esta consulta: recalcula sempre que a tela abre.
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<MetaComProgresso[]> => {
      const { data: metas, error } = await supabase
        .from("sales_goals").select("*").eq("org_id", orgId!)
        .lte("period_start", periodo.fim).gte("period_end", periodo.inicio)
        .order("period_start").order("created_at");
      if (error) throw error;
      if (!metas || metas.length === 0) return [];

      const inicio = metas.reduce((m, g) => (g.period_start < m ? g.period_start : m), metas[0].period_start);
      const fim = metas.reduce((m, g) => (g.period_end > m ? g.period_end : m), metas[0].period_end);
      const dados = await carregarDados(orgId!, inicio, fim);

      return metas.map((meta) => {
        const filtros = (meta.filters ?? {}) as FiltrosMeta;
        const valor = realizado({
          metrica: meta.goal_type as Metrica,
          responsavel: meta.assign_type === ASSIGN_INDIVIDUAL ? meta.user_id : null,
          periodo: { inicio: meta.period_start, fim: meta.period_end },
          filtros,
        }, dados);
        return { ...meta, filtros, realizado: valor, progresso: progresso(meta.goal_type as Metrica, Number(meta.target_value), valor) };
      });
    },
  });
}

export interface MetaParaSalvar {
  id?: string;
  name: string | null;
  goal_type: Metrica;
  assign_type: AssignType;
  user_id: string | null;
  target_value: number;
  period_kind: TipoPeriodo;
  period_start: string;
  period_end: string;
  filters: FiltrosMeta;
}

export function useSaveSalesGoal() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MetaParaSalvar) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const [ano, mes] = input.period_start.split("-").map(Number);
      const campos = {
        name: input.name?.trim() || null,
        goal_type: input.goal_type,
        goal_subtype: null,
        criteria: {},
        assign_type: input.assign_type,
        user_id: input.assign_type === ASSIGN_INDIVIDUAL ? input.user_id : null,
        team_id: null,
        target_value: input.target_value,
        period_kind: input.period_kind,
        period_start: input.period_start,
        period_end: input.period_end,
        // Mês e ano acompanham o início (o banco também garante, por trigger).
        period_month: mes,
        period_year: ano,
        filters: input.filters as Database["public"]["Tables"]["sales_goals"]["Insert"]["filters"],
      };
      const { error } = input.id
        ? await supabase.from("sales_goals").update(campos).eq("id", input.id)
        : await supabase.from("sales_goals").insert({ org_id: orgId, ...campos });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-goals", orgId] }),
  });
}

export function useDeleteSalesGoal() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-goals", orgId] }),
  });
}

/** Origens de lead já usadas nos contatos, para o filtro da meta. */
export function useOrigensDeLead() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["origens-de-lead", orgId],
    enabled: !!orgId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async (): Promise<string[]> => {
      const linhas = await todasAsLinhas<{ source: string | null }>((a, b) => supabase
        .from("contacts").select("source").eq("org_id", orgId!).not("source", "is", null).order("id").range(a, b));
      return [...new Set(linhas.map((c) => c.source as string).filter(Boolean))].sort();
    },
  });
}
