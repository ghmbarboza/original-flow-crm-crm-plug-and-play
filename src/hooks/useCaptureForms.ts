import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type CaptureForm = Database["public"]["Tables"]["capture_forms"]["Row"];

export type { CaptureField, CaptureFieldType } from "@/lib/formRules";
import { parseCaptureFields, type CaptureField } from "@/lib/formRules";

/**
 * Campos mínimos de todo formulário: nome e e-mail. O builder parte destes e o
 * submit sempre mapeia nome + e-mail para as colunas reais de `contacts`.
 */
export const DEFAULT_CAPTURE_FIELDS: CaptureField[] = [
  { key: "name", label: "Nome", type: "text", required: true },
  { key: "email", label: "E-mail", type: "email", required: true },
];

/** Lê o array de campos de um form, com fallback tolerante a dados legados. */
export function parseFields(fields: CaptureForm["fields"]): CaptureField[] {
  return parseCaptureFields(fields);
}

/** Normaliza um texto em slug: minúsculas, sem acento, hífens, sem bordas. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function useCaptureForms() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["capture-forms", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CaptureForm[]> => {
      const { data, error } = await supabase
        .from("capture_forms")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Pipelines e etapas da org, para os seletores de destino do builder.
 * Uma query só por recurso; o componente filtra as etapas pelo pipeline
 * escolhido.
 */
export function useCaptureFormTargets() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["capture-form-targets", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [pipelinesRes, stagesRes] = await Promise.all([
        supabase
          .from("pipelines")
          .select("id, name, is_default")
          .eq("org_id", orgId!)
          .order("is_default", { ascending: false })
          .order("name"),
        supabase
          .from("pipeline_stages")
          .select("id, name, pipeline_id, order")
          .eq("org_id", orgId!)
          .order("order", { ascending: true }),
      ]);
      if (pipelinesRes.error) throw pipelinesRes.error;
      if (stagesRes.error) throw stagesRes.error;
      return {
        pipelines: pipelinesRes.data ?? [],
        stages: stagesRes.data ?? [],
      };
    },
  });
}

export interface SaveCaptureFormInput {
  id?: string;
  name: string;
  slug: string;
  fields: CaptureField[];
  is_active: boolean;
  target_pipeline_id: string | null;
  target_stage_id: string | null;
  automation_id: string | null;
  source_default?: string;
  success_message?: string | null;
  redirect_url?: string | null;
  consent_text?: string | null;
  theme?: { primary?: string; background?: string };
}

export function useSaveCaptureForm() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveCaptureFormInput) => {
      if (!orgId) throw new Error("Organização não carregada.");

      const name = input.name.trim();
      if (!name) throw new Error("Informe o nome do formulário.");

      const slug = slugify(input.slug || input.name);
      if (!slug) throw new Error("O slug não pode ficar vazio.");

      if (input.fields.length === 0) {
        throw new Error("Adicione ao menos um campo ao formulário.");
      }

      // Slug único por org: rejeita colisão antes de gravar.
      const { data: clash, error: clashErr } = await supabase
        .from("capture_forms")
        .select("id")
        .eq("org_id", orgId)
        .eq("slug", slug)
        .maybeSingle();
      if (clashErr) throw clashErr;
      if (clash && clash.id !== input.id) {
        throw new Error(`Já existe um formulário com o slug "${slug}".`);
      }

      const payload = {
        name,
        slug,
        fields: input.fields as unknown as Database["public"]["Tables"]["capture_forms"]["Insert"]["fields"],
        is_active: input.is_active,
        target_pipeline_id: input.target_pipeline_id,
        target_stage_id: input.target_stage_id,
        automation_id: input.automation_id,
        source_default: (input.source_default ?? "").trim() || "capture_form",
        success_message: input.success_message?.trim() || null,
        redirect_url: input.redirect_url?.trim() || null,
        consent_text: input.consent_text?.trim() || null,
        theme: (input.theme ?? {}) as Database["public"]["Tables"]["capture_forms"]["Insert"]["theme"],
      };

      if (input.id) {
        const { error } = await supabase.from("capture_forms").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("capture_forms")
          .insert({ ...payload, org_id: orgId });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["capture-forms", orgId] }),
  });
}

export function useToggleCaptureFormActive() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("capture_forms").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["capture-forms", orgId] }),
  });
}

export function useDeleteCaptureForm() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("capture_forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["capture-forms", orgId] }),
  });
}
