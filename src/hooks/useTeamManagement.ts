import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/types/auth";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export interface TeamMember extends Profile {
  role: AppRole | null;
}

export function useTeamManagement() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const membersQuery = useQuery({
    queryKey: ["team-members"],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data: profiles, error } = await supabase
        .from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const map = new Map((roles ?? []).map((r: any) => [r.user_id, r.role as AppRole]));
      return (profiles ?? []).map((p: any) => ({ ...(p as Profile), role: map.get(p.id) ?? null }));
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["team-members"] });

  const approveMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").update({ is_approved: true }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Usuário aprovado"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao aprovar"),
  });

  const rejectMember = useMutation({
    mutationFn: async (userId: string) => {
      // Deleting profile triggers cascade — but auth user must be deleted via admin.
      // For the base template, we deactivate instead.
      const { error } = await supabase.from("profiles")
        .update({ is_active: false, is_approved: false }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Usuário rejeitado"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      if (userId === user?.id && newRole !== "admin") {
        // Verify not the only admin
        const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
        if ((admins?.length ?? 0) <= 1) {
          throw new Error("Você é o único administrador. Promova outro usuário antes de alterar seu role.");
        }
      }
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role atualizado"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const deactivateMember = useMutation({
    mutationFn: async (userId: string) => {
      if (userId === user?.id) throw new Error("Você não pode desativar sua própria conta.");
      const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Usuário desativado"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const reactivateMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").update({ is_active: true }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Usuário reativado"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  return {
    members: membersQuery.data ?? [],
    isLoading: membersQuery.isLoading,
    approveMember, rejectMember, changeRole, deactivateMember, reactivateMember,
  };
}
