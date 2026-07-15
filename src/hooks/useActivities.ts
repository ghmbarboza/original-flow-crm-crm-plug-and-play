import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ActivityType = Database["public"]["Enums"]["activity_type"];
type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
export type ActivityInsert = Database["public"]["Tables"]["activities"]["Insert"];

/** Atividade com os vínculos embutidos para exibir "a que se refere". */
export interface Activity extends ActivityRow {
  contact: { id: string; first_name: string; last_name: string | null } | null;
  company: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
}

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  call: "Ligação",
  email: "Email",
  meeting: "Reunião",
  note: "Nota",
  task: "Tarefa",
};

const SELECT = `
  *,
  contact:contacts(id, first_name, last_name),
  company:companies(id, name),
  deal:deals(id, title)
` as const;

export interface ActivityFilters {
  /** Um único tipo, ou vários. Omitido = todos. */
  type?: ActivityType | ActivityType[];
  /** `open` = não concluída; `done` = concluída. Omitido = ambas. */
  status?: "open" | "done";
  dealId?: string;
  contactId?: string;
}

/**
 * Atividades da org com filtros. É a fonte de /activities, de /tasks (type=task)
 * e da seção de atividades do detalhe do deal (dealId). A chave da query embute
 * os filtros para que cada recorte tenha seu próprio cache.
 */
export function useActivities(filters: ActivityFilters = {}) {
  const orgId = useOrgId();
  const types = filters.type
    ? Array.isArray(filters.type)
      ? filters.type
      : [filters.type]
    : undefined;

  return useQuery({
    queryKey: ["activities", orgId, { types, status: filters.status, dealId: filters.dealId, contactId: filters.contactId }],
    enabled: !!orgId,
    queryFn: async (): Promise<Activity[]> => {
      let query = supabase.from("activities").select(SELECT).eq("org_id", orgId!);

      if (types && types.length > 0) query = query.in("type", types);
      if (filters.status === "open") query = query.is("completed_at", null);
      if (filters.status === "done") query = query.not("completed_at", "is", null);
      if (filters.dealId) query = query.eq("deal_id", filters.dealId);
      if (filters.contactId) query = query.eq("contact_id", filters.contactId);

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Activity[];
    },
  });
}

/** Invalida todos os recortes de atividades e os módulos que as exibem embutidas. */
function invalidateActivities(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string | null,
  activity?: { deal_id?: string | null; contact_id?: string | null },
) {
  queryClient.invalidateQueries({ queryKey: ["activities", orgId] });
  if (activity?.deal_id) queryClient.invalidateQueries({ queryKey: ["deal_timeline", activity.deal_id] });
  if (activity?.contact_id) queryClient.invalidateQueries({ queryKey: ["contact_timeline", activity.contact_id] });
}

export function useCreateActivity() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<ActivityInsert, "org_id">) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      // O autor é o usuário logado, salvo quando já vier definido.
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("activities")
        .insert({ ...input, org_id: orgId, user_id: input.user_id ?? auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, input) => invalidateActivities(queryClient, orgId, input),
  });
}

export function useUpdateActivity() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<ActivityInsert>) => {
      const { error } = await supabase.from("activities").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, input) => invalidateActivities(queryClient, orgId, input),
  });
}

/** Alterna concluída/pendente carimbando (ou limpando) `completed_at`. */
export function useToggleActivityComplete() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean; deal_id?: string | null; contact_id?: string | null }) => {
      const { error } = await supabase
        .from("activities")
        .update({ completed_at: completed ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, input) => invalidateActivities(queryClient, orgId, input),
  });
}

export function useDeleteActivity() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; deal_id?: string | null; contact_id?: string | null }) => {
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, input) => invalidateActivities(queryClient, orgId, input),
  });
}
