import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useAuth } from "@/hooks/useAuth";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import type { Database } from "@/integrations/supabase/types";

/**
 * Voz (Sprint 12 B13): números, agente de voz, ligações (com realtime) e
 * campanhas. Credenciais e segredos nunca chegam ao front: tudo passa pela
 * function `voice`.
 */

export type PhoneNumber = Database["public"]["Tables"]["phone_numbers"]["Row"];
export type Call = Database["public"]["Tables"]["calls"]["Row"] & { contacts?: { first_name: string; last_name: string | null } | null };
export type VoiceCampaign = Database["public"]["Tables"]["voice_campaigns"]["Row"];

export interface VoiceAgentPublico {
  org_id: string; elevenlabs_agent_id: string | null; voice_id: string | null; first_message: string; language: string;
  max_duration_seconds: number; prompt_extra: string | null; synced_at: string | null; last_error: string | null; updated_at: string;
}
export interface VoiceStatus {
  agent: VoiceAgentPublico;
  numbers: PhoneNumber[];
  credentials: { ok: boolean; motivo?: string };
  webhook_url: string;
}

export const CALL_STATUS_LABEL: Record<string, string> = {
  queued: "Na fila", ringing: "Chamando", in_progress: "Em ligação", completed: "Concluída", busy: "Ocupado", failed: "Falhou", no_answer: "Não atendeu", canceled: "Cancelada",
};
export const CALL_CATEGORY_LABEL: Record<string, string> = {
  scheduled: "Reunião marcada", qualified: "Qualificado", not_interested: "Sem interesse", callback: "Pediu retorno", no_answer: "Não atendeu",
  voicemail: "Caixa postal", wrong_number: "Número errado", escalated: "Passou para humano", other: "Outro",
};
export const INBOUND_LABEL: Record<string, string> = { ai_answer: "A IA atende", forward_to_agent: "Encaminha para um número", voicemail: "Caixa postal" };

async function chamarVoz<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("voice", { body });
  if (error) throw await erroDeFunction(error, "Falha ao falar com a voz.");
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useVoiceStatus() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["voice-status", orgId],
    enabled: !!orgId,
    queryFn: () => chamarVoz<VoiceStatus>({ action: "status" }),
  });
}

export function useVoiceAction() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => chamarVoz<Record<string, unknown>>(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voice-status", orgId] });
      queryClient.invalidateQueries({ queryKey: ["calls", orgId] });
    },
  });
}

export function useSaveVoiceAgent() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { voice_id: string | null; first_message: string; max_duration_seconds: number; prompt_extra: string | null }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { error } = await supabase.from("voice_agents").upsert({ org_id: orgId, ...input, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["voice-status", orgId] }),
  });
}

export function useCalls(limite = 100) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!orgId) return;
    const canal = supabase.channel(`calls-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls", filter: `org_id=eq.${orgId}` }, () => queryClient.invalidateQueries({ queryKey: ["calls", orgId] }))
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [orgId, queryClient]);
  return useQuery({
    queryKey: ["calls", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Call[]> => {
      const { data, error } = await supabase.from("calls").select("*, contacts(first_name, last_name)").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(limite);
      if (error) throw error;
      return (data ?? []) as unknown as Call[];
    },
  });
}

export function useRecordingUrl() {
  return useMutation({
    mutationFn: async (path: string): Promise<string> => {
      const { data, error } = await supabase.storage.from("voice-recordings").createSignedUrl(path, 600);
      if (error || !data) throw new Error(error?.message ?? "Gravação indisponível.");
      return data.signedUrl;
    },
  });
}

export function useVoiceCampaigns() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["voice-campaigns", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<VoiceCampaign[]> => {
      const { data, error } = await supabase.from("voice_campaigns").select("*").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateVoiceCampaign() {
  const orgId = useOrgId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; instruction: string; phone_number_id: string | null; contact_ids: string[]; max_concurrent: number }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (!input.contact_ids.length) throw new Error("Escolha pelo menos um contato.");
      const { data: campanha, error } = await supabase.from("voice_campaigns").insert({
        org_id: orgId, name: input.name.trim(), instruction: input.instruction.trim() || null, phone_number_id: input.phone_number_id, max_concurrent: input.max_concurrent,
        status: "running", total: input.contact_ids.length, created_by: user?.id ?? null,
      }).select("id").single();
      if (error || !campanha) throw error ?? new Error("Falha ao criar a campanha.");
      const { error: e2 } = await supabase.from("voice_campaign_contacts").insert(input.contact_ids.map((contact_id) => ({ campaign_id: campanha.id, org_id: orgId, contact_id })));
      if (e2) throw e2;
      return campanha.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["voice-campaigns", orgId] }),
  });
}

export function useSetCampaignStatus() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: "running" | "paused" | "canceled" }) => {
      const { error } = await supabase.from("voice_campaigns").update({ status: input.status, updated_at: new Date().toISOString() }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["voice-campaigns", orgId] }),
  });
}
