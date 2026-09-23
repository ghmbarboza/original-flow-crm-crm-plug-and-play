// Perfil da IA por origem do lead (ai_source_profiles), usado por ai-reply,
// ai-outreach e submit-capture-form. Origem = contacts.source, comparada sem
// diferenciar maiúsculas.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface PerfilOrigem {
  source: string;
  label: string | null;
  instruction: string;
  outreach_instruction: string;
  outreach_template_name: string | null;
  funnel_mode: "inherit" | "auto" | "suggest";
  initial_stage_id: string | null;
}

export async function perfilDaOrigem(
  admin: SupabaseClient,
  orgId: string,
  source: string | null | undefined,
): Promise<PerfilOrigem | null> {
  const chave = (source ?? "").trim();
  if (!chave) return null;
  const { data } = await admin
    .from("ai_source_profiles")
    .select("source, label, instruction, outreach_instruction, outreach_template_name, funnel_mode, initial_stage_id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .ilike("source", chave)
    .limit(1)
    .maybeSingle();
  return (data as PerfilOrigem | null) ?? null;
}

/** Bloco do prompt com a instrução da origem, ou vazio. */
export function instrucaoDaOrigem(perfil: PerfilOrigem | null): string {
  const texto = (perfil?.instruction ?? "").trim();
  if (!texto) return "";
  const nome = perfil?.label?.trim() || perfil?.source || "";
  return `\nEste lead veio da origem "${nome}". Regras específicas para esta origem:\n${texto}`;
}
