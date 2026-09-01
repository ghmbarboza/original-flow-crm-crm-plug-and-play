import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "member";

/** Sub-papel do CRM. Ortogonal a AppRole: quem é `member` no auth pode ser gerente aqui. */
export type CrmRole = "diretor" | "gerente" | "agente";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  avatar_url: string | null;
  status: "online" | "offline" | "away" | "busy" | null;
  is_active: boolean;
  is_approved: boolean;
  /** Organização do usuário. Preenchida pelo trigger on_profile_created_assign_org. */
  org_id: string | null;
  crm_role: CrmRole | null;
  manager_id: string | null;
  /** Canais que o agente atende na distribuição. Array vazio = sem restrição. */
  assigned_channels: string[];
  created_at: string | null;
  updated_at: string | null;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isLoading: boolean;
  /**
   * A primeira carga de perfil/papel deste usuário terminou (com ou sem linha).
   * Enquanto false, org_id ainda pode estar a caminho: mutations que dependem
   * dele falhariam com "Organização não carregada".
   */
  profileSettled: boolean;
  isAdmin: boolean;
  isMember: boolean;
  isApproved: boolean;
  isActive: boolean;
  isPendingApproval: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string; isApproved?: boolean; isActive?: boolean }>;
  signUp: (fullName: string, email: string, password: string) => Promise<{ error?: string; pending?: boolean; isApproved?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
