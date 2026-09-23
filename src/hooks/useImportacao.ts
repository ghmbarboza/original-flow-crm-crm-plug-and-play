import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useAuth } from "@/hooks/useAuth";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { linhaParaRegistro, type ImportKind, type ImportSource } from "@/lib/importacao";
import type { Database } from "@/integrations/supabase/types";

export type ImportRow = Database["public"]["Tables"]["imports"]["Row"];
export type ImportRowDetail = Database["public"]["Tables"]["import_rows"]["Row"];

const LOTE = 200;

export interface ResultadoImportacao {
  created: number;
  updated: number;
  skipped: number;
  error: number;
  erros: { row_number: number; error: string }[];
}

export function useImports() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["imports", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ImportRow[]> => {
      const { data, error } = await supabase.from("imports").select("*").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Cria a importação, manda o arquivo em lotes para a function import-run e
 * fecha com as estatísticas e o relatório de erros. `onProgresso` recebe
 * quantas linhas já foram.
 */
export function useRunImport() {
  const orgId = useOrgId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: ImportKind;
      source: ImportSource;
      fileName: string;
      headers: string[];
      rows: string[][];
      lineNumbers: number[];
      mapping: Record<number, string>;
      stages: Record<string, string>;
      onProgresso?: (feitas: number, total: number) => void;
    }): Promise<{ importId: string } & ResultadoImportacao> => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data: imp, error } = await supabase.from("imports").insert({
        org_id: orgId, kind: input.kind, source: input.source, file_name: input.fileName, status: "pending",
        mapping: { columns: input.mapping, stages: input.stages, headers: input.headers } as never, created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;

      const total = { created: 0, updated: 0, skipped: 0, error: 0 };
      const erros: { row_number: number; error: string }[] = [];
      try {
        for (let i = 0; i < input.rows.length; i += LOTE) {
          const fatia = input.rows.slice(i, i + LOTE).map((row, j) => ({
            row_number: input.lineNumbers[i + j] ?? i + j + 2,
            data: linhaParaRegistro(input.headers, input.mapping, row),
          }));
          const { data, error: errRun } = await supabase.functions.invoke("import-run", { body: { import_id: imp.id, rows: fatia } });
          if (errRun) throw await erroDeFunction(errRun, "Falha ao importar.");
          if (data?.error) throw new Error(data.error);
          total.created += data.created ?? 0;
          total.updated += data.updated ?? 0;
          total.skipped += data.skipped ?? 0;
          total.error += data.error ?? 0;
          for (const r of (data.results ?? []) as { row_number: number; status: string; error?: string }[]) {
            if (r.status === "error") erros.push({ row_number: r.row_number, error: r.error ?? "erro" });
          }
          input.onProgresso?.(Math.min(input.rows.length, i + LOTE), input.rows.length);
        }
        const relatorio = erros.length ? ["linha;erro", ...erros.map((e) => `${e.row_number};${e.error.replace(/;/g, ",")}`)].join("\n") : null;
        await supabase.from("imports").update({
          status: "completed", stats: { total: input.rows.length, ...total } as never, error_report: relatorio, completed_at: new Date().toISOString(),
        }).eq("id", imp.id);
      } catch (e) {
        await supabase.from("imports").update({ status: "failed", stats: { total: input.rows.length, ...total } as never, error_report: e instanceof Error ? e.message : String(e) }).eq("id", imp.id);
        throw e;
      }
      return { importId: imp.id, ...total, erros };
    },
    onSuccess: () => {
      for (const key of ["imports", "contacts", "companies", "deals", "activities"]) queryClient.invalidateQueries({ queryKey: [key, orgId] });
    },
  });
}

export function useUndoImport() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (importId: string): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("desfazer_importacao", { p_import: importId });
      if (error) throw error;
      return (data ?? {}) as Record<string, number>;
    },
    onSuccess: () => {
      for (const key of ["imports", "contacts", "companies", "deals", "activities"]) queryClient.invalidateQueries({ queryKey: [key, orgId] });
    },
  });
}
