import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationPreference =
  Database["public"]["Tables"]["notification_preferences"]["Row"];

/** Últimas notificações do usuário logado (mais recentes primeiro). */
export function useNotifications(limit = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Assina realtime das notificações do usuário e invalida a query a cada
 * INSERT/UPDATE. Chame uma vez, num componente sempre montado (ex.: o sino).
 */
export function useNotificationsRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["notifications", user.id] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}

export function useMarkNotificationRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuário não carregado.");
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
}

/** Preferências de canal por tipo de evento, do usuário logado. */
export function useNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notification-preferences", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<NotificationPreference[]> => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ChannelPrefs = {
  channel_in_app: boolean;
  channel_email: boolean;
  channel_whatsapp: boolean;
};

/**
 * Salva a preferência de um tipo de evento. Faz find-or-insert (o schema não
 * garante um índice único (user_id, event_type), então evitamos upsert cego):
 * se já existe linha para o par, atualiza; senão, insere.
 */
export function useSaveNotificationPreference() {
  const { user } = useAuth();
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventType: string } & ChannelPrefs) => {
      if (!user || !orgId) throw new Error("Sessão não carregada.");
      const { data: existing, error: selError } = await supabase
        .from("notification_preferences")
        .select("id")
        .eq("user_id", user.id)
        .eq("event_type", input.eventType)
        .maybeSingle();
      if (selError) throw selError;

      const values = {
        channel_in_app: input.channel_in_app,
        channel_email: input.channel_email,
        channel_whatsapp: input.channel_whatsapp,
      };

      if (existing) {
        const { error } = await supabase
          .from("notification_preferences")
          .update(values)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_preferences").insert({
          org_id: orgId,
          user_id: user.id,
          event_type: input.eventType,
          ...values,
        });
        if (error) throw error;
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notification-preferences", user?.id] }),
  });
}
