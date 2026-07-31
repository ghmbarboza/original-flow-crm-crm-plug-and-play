import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type SalesGoal = Database["public"]["Tables"]["sales_goals"]["Row"];

export const GOAL_TYPES = [
  { value: "revenue", label: "Receita" },
  { value: "deals", label: "Negócios ganhos" },
  { value: "activities", label: "Atividades" },
  { value: "contacts", label: "Contatos" },
  { value: "deal_criteria", label: "Critério de deal" },
] as const;

export type GoalType = (typeof GOAL_TYPES)[number]["value"];

/**
 * Subtipos das metas por critério de deal (Parte 4 do Sprint 10B).
 * `lowerIsBetter` inverte a leitura: TMA de 31h contra meta de 48h está OK.
 */
export const GOAL_SUBTYPES = [
  { value: "min_deal_value", label: "Deals acima de um valor", unit: "deals", lowerIsBetter: false },
  { value: "conversion_rate", label: "Taxa de conversão mínima", unit: "%", lowerIsBetter: false },
  { value: "avg_response_time", label: "TMA máximo (1ª resposta)", unit: "h", lowerIsBetter: true },
] as const;

export type GoalSubtype = (typeof GOAL_SUBTYPES)[number]["value"];

// Type alias (não interface) para ser atribuível a Json nos writes do Supabase.
export type GoalCriteria = {
  /** min_deal_value: só deals ganhos com valor >= este entram na conta. */
  min_value?: number;
};

export interface GoalWithProgress extends SalesGoal {
  computed_current: number;
}

/**
 * Metas do período com progresso calculado ao vivo.
 *
 * Em vez de confiar em `current_value` (que precisaria de um job para atualizar),
 * o progresso é recomputado a partir dos dados reais do mês: receita/negócios de
 * deals ganhos, atividades criadas e contatos criados — por dono quando a meta é
 * individual.
 */
export function useSalesGoals(month: number, year: number) {
  const orgId = useOrgId();

  return useQuery({
    queryKey: ["sales-goals", orgId, month, year],
    enabled: !!orgId,
    queryFn: async (): Promise<GoalWithProgress[]> => {
      const from = new Date(Date.UTC(year, month - 1, 1)).toISOString();
      const to = new Date(Date.UTC(year, month, 1)).toISOString();

      const [goals, deals, lostDeals, activities, contacts, conversations] = await Promise.all([
        supabase.from("sales_goals").select("*").eq("org_id", orgId!).eq("period_month", month).eq("period_year", year),
        supabase.from("deals").select("value, owner_id, status, updated_at").eq("org_id", orgId!).eq("status", "won").gte("updated_at", from).lt("updated_at", to),
        supabase.from("deals").select("owner_id, updated_at").eq("org_id", orgId!).eq("status", "lost").gte("updated_at", from).lt("updated_at", to),
        supabase.from("activities").select("user_id, created_at").eq("org_id", orgId!).gte("created_at", from).lt("created_at", to),
        supabase.from("contacts").select("owner_id, created_at").eq("org_id", orgId!).is("merged_into_id", null).gte("created_at", from).lt("created_at", to),
        supabase.from("conversations").select("assigned_to, first_response_minutes, created_at").eq("org_id", orgId!).not("first_response_minutes", "is", null).gte("created_at", from).lt("created_at", to),
      ]);

      if (goals.error) throw goals.error;

      /** Soma um valor por dono (null = total da org). */
      function actual(type: GoalType, userId: string | null): number {
        if (type === "revenue") {
          return (deals.data ?? []).filter((d) => !userId || d.owner_id === userId).reduce((s, d) => s + Number(d.value ?? 0), 0);
        }
        if (type === "deals") {
          return (deals.data ?? []).filter((d) => !userId || d.owner_id === userId).length;
        }
        if (type === "activities") {
          return (activities.data ?? []).filter((a) => !userId || a.user_id === userId).length;
        }
        return (contacts.data ?? []).filter((c) => !userId || c.owner_id === userId).length;
      }

      /** Metas por critério de deal (Parte 4): cada subtipo tem a própria conta. */
      function actualCriteria(subtype: string | null, criteria: GoalCriteria, userId: string | null): number {
        const won = (deals.data ?? []).filter((d) => !userId || d.owner_id === userId);
        if (subtype === "min_deal_value") {
          const min = Number(criteria.min_value ?? 0);
          return won.filter((d) => Number(d.value ?? 0) >= min).length;
        }
        if (subtype === "conversion_rate") {
          const lost = (lostDeals.data ?? []).filter((d) => !userId || d.owner_id === userId).length;
          const total = won.length + lost;
          return total > 0 ? Math.round((won.length / total) * 100) : 0;
        }
        if (subtype === "avg_response_time") {
          const respostas = (conversations.data ?? [])
            .filter((c) => !userId || c.assigned_to === userId)
            .map((c) => Number(c.first_response_minutes));
          if (respostas.length === 0) return 0;
          const mediaMin = respostas.reduce((s, v) => s + v, 0) / respostas.length;
          return Math.round((mediaMin / 60) * 10) / 10; // horas com 1 casa
        }
        return 0;
      }

      return (goals.data ?? []).map((goal) => {
        const userId = goal.assign_type === "user" ? goal.user_id : null;
        return {
          ...goal,
          // Meta individual usa o dono; meta de time soma toda a org (aproximação).
          computed_current:
            goal.goal_type === "deal_criteria"
              ? actualCriteria(goal.goal_subtype, (goal.criteria ?? {}) as GoalCriteria, userId)
              : actual(goal.goal_type as GoalType, userId),
        };
      });
    },
  });
}

export function useSaveSalesGoal() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      goal_type: GoalType;
      goal_subtype?: GoalSubtype | null;
      criteria?: GoalCriteria;
      assign_type: "user" | "team";
      user_id: string | null;
      team_id: string | null;
      target_value: number;
      period_month: number;
      period_year: number;
    }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const fields = {
        goal_type: input.goal_type,
        goal_subtype: input.goal_subtype ?? null,
        criteria: input.criteria ?? {},
        assign_type: input.assign_type,
        user_id: input.user_id,
        team_id: input.team_id,
        target_value: input.target_value,
      };
      if (input.id) {
        const { error } = await supabase.from("sales_goals").update(fields).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sales_goals").insert({
          org_id: orgId,
          ...fields,
          period_month: input.period_month,
          period_year: input.period_year,
        });
        if (error) throw error;
      }
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
