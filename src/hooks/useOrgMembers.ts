import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";

export interface OrgMember {
  id: string;
  full_name: string;
}

/**
 * Membros da organização, para exibir e escolher o dono (owner) de um registro.
 *
 * `owner_id` aponta para auth.users, não para profiles — o PostgREST não consegue
 * embutir o nome numa só query. Buscamos os profiles à parte e resolvemos o nome
 * pelo id no cliente.
 */
export function useOrgMembers() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<OrgMember[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("org_id", orgId!)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Mapa id → nome, para resolver o owner de uma linha da tabela sem N queries. */
export function useOrgMemberNames(): Map<string, string> {
  const { data } = useOrgMembers();
  return new Map((data ?? []).map((member) => [member.id, member.full_name]));
}
