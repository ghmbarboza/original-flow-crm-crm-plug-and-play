import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";

/** Origens que o próprio CRM grava, com rótulo para a tela. */
export const ORIGENS_CONHECIDAS: Record<string, string> = {
  capture_form: "Formulário de captura",
  whatsapp: "WhatsApp",
  flowcrm: "Webhook de entrada",
  import: "Importação",
  manual: "Cadastro manual",
};

export function rotuloOrigem(source: string): string {
  return ORIGENS_CONHECIDAS[source] ?? source;
}

/**
 * Origens (contacts.source) já usadas na org, para o construtor de automações
 * sugerir valores reais em vez de o usuário adivinhar a grafia. Limite alto
 * porque a coluna é curta e a lista vira um conjunto no cliente.
 */
const LIMITE_LEITURA = 2000;

export function useContactSources() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["contact-sources", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("source")
        .eq("org_id", orgId!)
        .not("source", "is", null)
        .neq("source", "")
        .limit(LIMITE_LEITURA);
      if (error) throw error;
      const vistas = new Set<string>(Object.keys(ORIGENS_CONHECIDAS));
      for (const row of data ?? []) if (row.source) vistas.add(row.source);
      return [...vistas].sort((a, b) => rotuloOrigem(a).localeCompare(rotuloOrigem(b), "pt-BR"));
    },
  });
}
