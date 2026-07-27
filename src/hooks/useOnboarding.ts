import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface OnboardingProgress {
  user_id: string;
  completed_steps: string[];
  is_completed: boolean;
}

/**
 * ATENÇÃO: a tabela `onboarding_progress` NÃO existe neste banco.
 *
 * A migration que a cria (20260501000002_onboarding_progress.sql) está no repo,
 * mas nunca foi aplicada aqui — provavelmente não veio no remix do projeto base.
 * Confirmado em information_schema.columns: zero linhas.
 *
 * Consequência: toda consulta abaixo falha com "relation does not exist", e o
 * erro é engolido porque o código só desestrutura `data`, nunca `error`. O
 * onboarding se comporta como se o usuário nunca tivesse progresso.
 *
 * O cast fica com disable explícito em vez de um tipo inventado: declarar um
 * shape para uma tabela inexistente seria afirmar algo falso. Some quando a
 * migration for aplicada e os tipos regenerados.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
