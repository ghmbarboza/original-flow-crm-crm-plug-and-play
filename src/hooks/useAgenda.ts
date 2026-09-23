import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useAuth } from "@/hooks/useAuth";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import type { Database } from "@/integrations/supabase/types";

/**
 * Agenda nativa (Sprint 12 B11): reuniões, política de agenda da org e
 * calendário externo (Nylas) do usuário. A IA e o cron escrevem na mesma
 * tabela; a tela acompanha por realtime.
 */

export type Appointment = Database["public"]["Tables"]["appointments"]["Row"] & {
  contacts?: { first_name: string; last_name: string | null; whatsapp_phone: string | null } | null;
};
export type SchedulingPolicy = Database["public"]["Tables"]["scheduling_policies"]["Row"];
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "no_show" | "cancelled";

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Marcada",
  confirmed: "Confirmada",
  completed: "Realizada",
  no_show: "Não compareceu",
  cancelled: "Cancelada",
};
export const APPOINTMENT_SOURCE_LABEL: Record<string, string> = { ia: "pela IA", manual: "à mão", calcom: "pelo Cal.com" };
export const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CHAVE = "appointments";

function useInvalidar() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [CHAVE, orgId] });
    queryClient.invalidateQueries({ queryKey: ["activities", orgId] });
  };
}

export function useAppointments(inicio: string, fim: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [CHAVE, orgId, inicio, fim],
    enabled: !!orgId,
    queryFn: async (): Promise<Appointment[]> => {
      const { data, error } = await supabase.from("appointments")
        .select("*, contacts(first_name, last_name, whatsapp_phone)")
        .eq("org_id", orgId!).gte("starts_at", inicio).lt("starts_at", fim).order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as Appointment[];
    },
  });
}

export interface EntradaReuniao {
  id?: string;
  title: string;
  contact_id: string | null;
  deal_id?: string | null;
  owner_id: string | null;
  starts_at: string;
  duration_minutes: number;
  description?: string | null;
  location?: string | null;
}

export function useSaveAppointment() {
  const orgId = useOrgId();
  const { user } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: EntradaReuniao): Promise<Appointment> => {
      if (!orgId) throw new Error("Organização não carregada.");
      const inicio = new Date(input.starts_at);
      if (Number.isNaN(inicio.getTime())) throw new Error("Informe data e hora válidas.");
      const fim = new Date(inicio.getTime() + input.duration_minutes * 60_000);
      const campos = {
        title: input.title.trim(), contact_id: input.contact_id, deal_id: input.deal_id ?? null, owner_id: input.owner_id,
        starts_at: inicio.toISOString(), ends_at: fim.toISOString(), description: input.description?.trim() || null, location: input.location?.trim() || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
        calendar_sync_status: input.owner_id ? "pending" : "none",
      };
      const q = input.id
        ? supabase.from("appointments").update(campos).eq("id", input.id).select("*").single()
        : supabase.from("appointments").insert({ org_id: orgId, source: "manual", created_by: user?.id ?? null, ...campos }).select("*").single();
      const { data, error } = await q;
      if (error) {
        if (error.code === "23P01") throw new Error("O responsável já tem uma reunião nesse horário.");
        throw error;
      }
      // Espelhar no calendário não segura a tela: roda em segundo plano.
      if (data.owner_id) void supabase.functions.invoke("calendar", { body: { action: "sync_event", appointment_id: data.id } }).catch(() => null);
      return data as Appointment;
    },
    onSuccess: invalidar,
  });
}

export function useSetAppointmentStatus() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: { id: string; status: AppointmentStatus; reason?: string }) => {
      const campos: Partial<Database["public"]["Tables"]["appointments"]["Update"]> = { status: input.status };
      if (input.status === "cancelled") campos.cancel_reason = input.reason ?? "Cancelada pela equipe";
      if (input.status === "confirmed") campos.confirmed_at = new Date().toISOString();
      if (input.status === "no_show") campos.no_show_marked_at = new Date().toISOString();
      const { data, error } = await supabase.from("appointments").update(campos).eq("id", input.id).select("id, owner_id").single();
      if (error) throw error;
      if (data.owner_id && input.status === "cancelled") void supabase.functions.invoke("calendar", { body: { action: "sync_event", appointment_id: data.id } }).catch(() => null);
    },
    onSuccess: invalidar,
  });
}

// --- Política ---------------------------------------------------------------------

export function useSchedulingPolicy() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["scheduling-policy", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<SchedulingPolicy | null> => {
      const { data, error } = await supabase.from("scheduling_policies").select("*").eq("org_id", orgId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveSchedulingPolicy() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SchedulingPolicy>) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { error } = await supabase.from("scheduling_policies").upsert({ ...input, org_id: orgId, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduling-policy", orgId] }),
  });
}

// --- Calendário externo ---------------------------------------------------------

export interface CalendarStatus {
  credentials_ready: boolean;
  integration: { id: string; provider: string; grant_provider: string | null; account_email: string | null; status: string; sync_enabled: boolean; create_meet: boolean; last_synced_at: string | null; last_error: string | null } | null;
}

async function chamarCalendario<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("calendar", { body });
  if (error) throw await erroDeFunction(error, "Falha ao falar com o calendário.");
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useCalendarStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["calendar-status", user?.id],
    enabled: !!user,
    queryFn: () => chamarCalendario<CalendarStatus>({ action: "status" }),
  });
}

export function useCalendarAction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => chamarCalendario<{ url?: string }>(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-status", user?.id] }),
  });
}

// --- Apoio da tela ---------------------------------------------------------------------

export function useContactOptions(busca: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["contact-options", orgId, busca],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from("contacts").select("id, first_name, last_name, email").eq("org_id", orgId!).is("merged_into_id", null).order("first_name").limit(20);
      if (busca.trim()) q = q.ilike("first_name", `${busca.trim().replace(/[%_,()]/g, "")}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOrgMembers() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org-members", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").eq("org_id", orgId!).order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
