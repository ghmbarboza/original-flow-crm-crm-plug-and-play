import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * `completed_steps` é jsonb no banco, então chega como Json. Aqui ele é sempre
 * uma lista de ids de passo — normalizamos na leitura para o resto do hook não
 * precisar checar o formato.
 */
function toSteps(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const onboardingTable = () => supabase.from("onboarding_progress");

export function useOnboarding() {
  const { user } = useAuth();
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setIsCompleted(null);
      setCompletedSteps([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const { data, error } = await onboardingTable()
      .select("user_id, completed_steps, is_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    // Sem linha ainda: cria a do usuário. Um erro real na leitura não deve virar
    // "vamos criar" — antes o código não distinguia os dois casos e engolia
    // qualquer falha como se o usuário não tivesse progresso.
    if (error) {
      setIsLoading(false);
      return;
    }

    if (!data) {
      const { data: created } = await onboardingTable()
        .insert({ user_id: user.id, completed_steps: [], is_completed: false })
        .select("user_id, completed_steps, is_completed")
        .maybeSingle();
      setIsCompleted(created?.is_completed ?? false);
      setCompletedSteps(toSteps(created?.completed_steps));
    } else {
      setIsCompleted(data.is_completed ?? false);
      setCompletedSteps(toSteps(data.completed_steps));
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const markStepComplete = useCallback(
    async (stepId: string) => {
      if (!user) return;
      const next = Array.from(new Set([...completedSteps, stepId]));
      setCompletedSteps(next);
      await onboardingTable().upsert({
        user_id: user.id,
        completed_steps: next,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    },
    [user, completedSteps],
  );

  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    setIsCompleted(true);
    await onboardingTable().upsert({
      user_id: user.id,
      is_completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }, [user]);

  const resetOnboarding = useCallback(async () => {
    if (!user) return;
    setIsCompleted(false);
    setCompletedSteps([]);
    await onboardingTable().upsert({
      user_id: user.id,
      is_completed: false,
      completed_steps: [],
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }, [user]);

  return {
    isCompleted: !!isCompleted,
    completedSteps,
    isLoading,
    markStepComplete,
    completeOnboarding,
    resetOnboarding,
  };
}
