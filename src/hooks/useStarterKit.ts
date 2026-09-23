import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useAuth } from "@/hooks/useAuth";
import { erroDeFunction } from "@/integrations/supabase/functionError";

/** Espelho de supabase/functions/_shared/starterKit.ts (o que a function devolve). */
export interface KitInicial {
  automations: { name: string; description: string; trigger: { type: string }; conditions: { field: string; op: string; value: string }[]; actions: { type: string; params: Record<string, string> }[] }[];
  followup: { max_attempts: number; on_limit_reached: string; steps: { delay_hours: number; message: string }[] } | null;
  sequences: { name: string; steps: { delay_days: number; subject: string; body_html: string }[] }[];
  email_templates: { name: string; subject: string; body_html: string }[];
  whatsapp_templates: { name: string; category: string; language: string; body_text: string; example_params: string[] }[];
  quick_replies: { shortcut: string; title: string; content: string }[];
}

export type BlocoKit = keyof KitInicial;

export const BLOCO_LABELS: Record<BlocoKit, string> = {
  automations: "Automações",
  followup: "Follow-up de WhatsApp",
  sequences: "Sequências de e-mail",
  email_templates: "Modelos de e-mail",
  whatsapp_templates: "Templates de WhatsApp (para aprovação da Meta)",
  quick_replies: "Respostas rápidas",
};

/** Pede o kit à IA. Nada é gravado aqui. */
export function useGenerateStarterKit() {
  return useMutation({
    mutationFn: async (): Promise<KitInicial> => {
      const { data, error } = await supabase.functions.invoke("generate-starter-kit", { body: {} });
      if (error) throw await erroDeFunction(error, "Não foi possível gerar o kit.");
      if (data?.error) throw new Error(data.error);
      return data.kit as KitInicial;
    },
  });
}

export interface SelecaoKit {
  automations: number[];
  followup: boolean;
  sequences: number[];
  email_templates: number[];
  whatsapp_templates: number[];
  quick_replies: number[];
}

export function selecionarTudo(kit: KitInicial): SelecaoKit {
  return {
    automations: kit.automations.map((_, i) => i),
    followup: !!kit.followup,
    sequences: kit.sequences.map((_, i) => i),
    email_templates: kit.email_templates.map((_, i) => i),
    whatsapp_templates: kit.whatsapp_templates.map((_, i) => i),
    quick_replies: kit.quick_replies.map((_, i) => i),
  };
}

/**
 * Grava os itens escolhidos nas tabelas reais. Automações e follow-up nascem
 * desligados (o usuário liga quando quiser); templates de WhatsApp viram
 * rascunhos para aprovação em Campanhas > Templates.
 */
export function useApplyStarterKit() {
  const orgId = useOrgId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kit, selecao }: { kit: KitInicial; selecao: SelecaoKit }): Promise<Record<BlocoKit, number>> => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const feitos: Record<BlocoKit, number> = { automations: 0, followup: 0, sequences: 0, email_templates: 0, whatsapp_templates: 0, quick_replies: 0 };

      for (const i of selecao.automations) {
        const a = kit.automations[i];
        if (!a) continue;
        const { error } = await supabase.from("automations").insert({
          org_id: orgId, name: a.name, description: a.description, is_active: false,
          trigger: a.trigger as never, conditions: a.conditions as never, actions: a.actions as never, created_by: user?.id ?? null,
        });
        if (error) throw error;
        feitos.automations++;
      }

      if (selecao.followup && kit.followup) {
        const f = kit.followup;
        const { error: errCfg } = await supabase.from("followup_configs").upsert(
          { org_id: orgId, is_active: false, max_attempts: f.max_attempts, on_limit_reached: f.on_limit_reached, updated_at: new Date().toISOString() },
          { onConflict: "org_id" },
        );
        if (errCfg) throw errCfg;
        const { error: errDel } = await supabase.from("followup_steps").delete().eq("org_id", orgId);
        if (errDel) throw errDel;
        const { error: errIns } = await supabase.from("followup_steps").insert(
          f.steps.map((p, i) => ({ org_id: orgId, order: i, delay_hours: p.delay_hours, message_template: p.message })),
        );
        if (errIns) throw errIns;
        feitos.followup = 1;
      }

      for (const i of selecao.sequences) {
        const s = kit.sequences[i];
        if (!s) continue;
        const { data: seq, error: errSeq } = await supabase.from("email_sequences").insert({ org_id: orgId, name: s.name, is_active: false }).select("id").single();
        if (errSeq) throw errSeq;
        for (const [j, passo] of s.steps.entries()) {
          const { data: tpl, error: errTpl } = await supabase.from("email_templates")
            .insert({ org_id: orgId, name: `${s.name} — etapa ${j + 1}`, subject: passo.subject, body_html: passo.body_html }).select("id").single();
          if (errTpl) throw errTpl;
          const { error: errPasso } = await supabase.from("email_sequence_steps")
            .insert({ org_id: orgId, sequence_id: seq.id, template_id: tpl.id, delay_days: passo.delay_days, order: j });
          if (errPasso) throw errPasso;
        }
        feitos.sequences++;
      }

      for (const i of selecao.email_templates) {
        const t = kit.email_templates[i];
        if (!t) continue;
        const { error } = await supabase.from("email_templates").insert({ org_id: orgId, name: t.name, subject: t.subject, body_html: t.body_html });
        if (error) throw error;
        feitos.email_templates++;
      }

      for (const i of selecao.whatsapp_templates) {
        const t = kit.whatsapp_templates[i];
        if (!t) continue;
        const { error } = await supabase.from("whatsapp_template_drafts").upsert(
          { org_id: orgId, name: t.name, category: t.category, language: t.language, body_text: t.body_text, example_params: t.example_params as never, status: "draft" },
          { onConflict: "org_id,name" },
        );
        if (error) throw error;
        feitos.whatsapp_templates++;
      }

      for (const i of selecao.quick_replies) {
        const q = kit.quick_replies[i];
        if (!q) continue;
        const { error } = await supabase.from("quick_replies").insert({ org_id: orgId, shortcut: q.shortcut, title: q.title, message: q.content, created_by: user?.id ?? null });
        if (error) throw error;
        feitos.quick_replies++;
      }

      await supabase.from("organizations").update({ starter_kit_applied_at: new Date().toISOString() }).eq("id", orgId);
      return feitos;
    },
    onSuccess: () => {
      for (const key of ["automations", "followup-config", "followup-steps", "email-sequences", "email-templates", "quick-replies", "whatsapp-template-drafts", "organization"]) {
        queryClient.invalidateQueries({ queryKey: [key, orgId] });
      }
    },
  });
}
