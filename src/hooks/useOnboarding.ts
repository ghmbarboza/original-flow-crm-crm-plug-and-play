import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface OnboardingProgress {
  user_id: string;
  completed_steps: string[];
  is_completed: boolean;
}

// onboarding_progress is created by migration after the base types were generated;
// cast through `as any` to bypass the generated typed surface until regen.
const onboardingTable = () => (supabase as any).from("onboarding_progress");

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

    const { data } = await onboardingTable()
      .select("user_id, completed_steps, is_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      const { data: created } = await onboardingTable()
        .insert({ user_id: user.id, completed_steps: [], is_completed: false })
        .select("user_id, completed_steps, is_completed")
        .maybeSingle();
      const row = created as OnboardingProgress | null;
      setIsCompleted(row?.is_completed ?? false);
      setCompletedSteps(row?.completed_steps ?? []);
    } else {
      const row = data as OnboardingProgress;
      setIsCompleted(row.is_completed);
      setCompletedSteps(row.completed_steps ?? []);
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
