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
] as const;

export type GoalType = (typeof GOAL_TYPES)[number]["value"];

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

      const [goals, deals, activities, contacts] = await Promise.all([
        supabase.from("sales_goals").select("*").eq("org_id", orgId!).eq("period_month", month).eq("period_year", year),
        supabase.from("deals").select("value, owner_id, status, updated_at").eq("org_id", orgId!).eq("status", "won").gte("updated_at", from).lt("updated_at", to),
        supabase.from("activities").select("user_id, created_at").eq("org_id", orgId!).gte("created_at", from).lt("created_at", to),
        supabase.from("contacts").select("owner_id, created_at").eq("org_id", orgId!).is("merged_into_id", null).gte("created_at", from).lt("created_at", to),
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

      return (goals.data ?? []).map((goal) => ({
        ...goal,
        // Meta individual usa o dono; meta de time soma toda a org (aproximação).
        computed_current: actual(goal.goal_type as GoalType, goal.assign_type === "user" ? goal.user_id : null),
      }));
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
      assign_type: "user" | "team";
      user_id: string | null;
      team_id: string | null;
      target_value: number;
      period_month: number;
      period_year: number;
    }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("sales_goals")
          .update({
            goal_type: input.goal_type,
            assign_type: input.assign_type,
            user_id: input.user_id,
            team_id: input.team_id,
            target_value: input.target_value,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sales_goals").insert({ org_id: orgId, ...input });
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
