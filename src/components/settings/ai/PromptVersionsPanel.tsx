import { useMemo, useState } from "react";
import { toast } from "sonner";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePromptVersions, useRevertPromptVersion, type PromptVersion,
} from "@/hooks/useAIConfig";
import { useOrgMemberNames } from "@/hooks/useOrgMembers";
import { formatDateTime } from "@/lib/format";

/**
 * Diff linha a linha entre duas versões do prompt. Implementação simples por
 * linha (não LCS): marca linhas presentes só numa das versões. Suficiente para
 * o usuário ver o que mudou entre a versão atual e a anterior.
 */
function diffLines(previous: string, current: string) {
  const prev = new Set(previous.split("\n"));
  const curr = new Set(current.split("\n"));
  const rows: { text: string; kind: "same" | "added" | "removed" }[] = [];
  for (const line of previous.split("\n")) {
    if (!curr.has(line)) rows.push({ text: line, kind: "removed" });
  }
  for (const line of current.split("\n")) {
    rows.push({ text: line, kind: prev.has(line) ? "same" : "added" });
  }
  return rows;
}

export function PromptVersionsPanel() {
  const { data: versions, isLoading } = usePromptVersions();
  const revert = useRevertPromptVersion();
  const memberNames = useOrgMemberNames();
  const [selected, setSelected] = useState<PromptVersion | null>(null);

  // Versão comparada: a imediatamente anterior à selecionada.
  const previous = useMemo(() => {
    if (!selected || !versions) return null;
    return versions.find((v) => v.version === selected.version - 1) ?? null;
  }, [selected, versions]);

  const diff = useMemo(() => {
    if (!selected) return [];
    return diffLines(previous?.system_prompt ?? "", selected.system_prompt);
  }, [selected, previous]);

  const handleRevert = async (version: PromptVersion) => {
    try {
      await revert.mutateAsync(version);
      toast.success(`Prompt revertido para a versão ${version.version}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reverter.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="via-card p-6 text-center">
        <History className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nenhuma versão ainda. Cada vez que você salvar a personalidade com um prompt diferente,
          uma versão é registrada aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ul className="space-y-2">
        {versions.map((version) => (
          <li
            key={version.id}
            className="via-card flex items-center justify-between gap-3 p-3"
            style={selected?.id === version.id ? { outline: "2px solid var(--via-navy)" } : undefined}
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(version)}>
              <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                Versão {version.version}
                {version.notes && (
                  <span className="ml-2 text-xs font-normal" style={{ color: "var(--via-text-muted)" }}>
                    {version.notes}
                  </span>
                )}
              </p>
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                {formatDateTime(version.created_at)}
                {version.created_by && ` · ${memberNames.get(version.created_by) ?? ""}`}
              </p>
            </button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => handleRevert(version)}
              disabled={revert.isPending || version.version === versions[0].version}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
              Reverter
            </Button>
          </li>
        ))}
      </ul>

      <div className="via-card p-3">
        {selected ? (
          <>
            <p className="mb-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Diferenças da versão {selected.version}
              {previous ? ` vs ${previous.version}` : " (primeira versão)"}
            </p>
            <div className="max-h-96 overflow-auto rounded-md p-2 font-mono text-xs" style={{ background: "var(--via-surface)" }}>
              {diff.map((row, i) => (
                <div
                  key={i}
                  style={{
                    color:
                      row.kind === "added"
                        ? "var(--via-success)"
                        : row.kind === "removed"
                          ? "var(--via-coral)"
                          : "var(--via-text-body)",
                    textDecoration: row.kind === "removed" ? "line-through" : "none",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {row.kind === "added" ? "+ " : row.kind === "removed" ? "- " : "  "}
                  {row.text || " "}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
            Selecione uma versão à esquerda para ver o diff em relação à anterior.
          </p>
        )}
      </div>
    </div>
  );
}
