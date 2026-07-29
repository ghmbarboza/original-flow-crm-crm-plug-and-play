import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";

/** Item normalizado: dois campos de texto (ex.: pergunta/resposta, objeção/resposta). */
export interface KnowledgeItem {
  id: string;
  a: string;
  b: string;
}

interface Props {
  items: KnowledgeItem[];
  isLoading: boolean;
  labelA: string;
  labelB: string;
  emptyLabel: ReactNode;
  onSave: (input: { id?: string; a: string; b: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onImport: (rows: { a: string; b: string }[]) => Promise<{ inserted: number }>;
}

export function KnowledgePanel({
  items, isLoading, labelA, labelB, emptyLabel, onSave, onDelete, onImport,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ a: "", b: "" });
  const [adding, setAdding] = useState(false);

  const startEdit = (item: KnowledgeItem) => {
    setEditingId(item.id);
    setDraft({ a: item.a, b: item.b });
    setAdding(false);
  };

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setDraft({ a: "", b: "" });
  };

  const cancel = () => {
    setAdding(false);
    setEditingId(null);
    setDraft({ a: "", b: "" });
  };

  const save = async () => {
    if (!draft.a.trim() || !draft.b.trim()) {
      toast.error(`Preencha ${labelA.toLowerCase()} e ${labelB.toLowerCase()}.`);
      return;
    }
    try {
      await onSave({ id: editingId ?? undefined, a: draft.a.trim(), b: draft.b.trim() });
      toast.success(editingId ? "Atualizado." : "Adicionado.");
      cancel();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  const remove = async (id: string) => {
    try {
      await onDelete(id);
      toast.success("Removido.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover.");
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed = parseCsv(await file.text());
    // Import simples: primeira coluna = campo A, segunda = campo B.
    const rows = parsed.rows
      .map((r) => ({ a: (r[0] ?? "").trim(), b: (r[1] ?? "").trim() }))
      .filter((r) => r.a && r.b);
    if (rows.length === 0) {
      toast.error("Nenhuma linha válida. Use duas colunas: " + `${labelA} e ${labelB}.`);
      return;
    }
    try {
      const { inserted } = await onImport(rows);
      toast.success(`${inserted} item(ns) importado(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar.");
    }
  };

  const downloadTemplate = () => {
    downloadCsv(
      "modelo-base-conhecimento.csv",
      toCsv([labelA, labelB], [["Exemplo de " + labelA.toLowerCase(), "Exemplo de " + labelB.toLowerCase()]]),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={startAdd} className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Adicionar
        </Button>
        <label className="cursor-pointer">
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
          <span className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm" style={{ borderColor: "var(--via-border)" }}>
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            Importar CSV
          </span>
        </label>
        <Button size="sm" variant="ghost" onClick={downloadTemplate} className="gap-1.5">
          <Download className="h-4 w-4" strokeWidth={1.5} />
          Modelo
        </Button>
      </div>

      {adding && (
        <div className="via-card space-y-2 p-3">
          <Input placeholder={labelA} value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value })} autoFocus />
          <Textarea placeholder={labelB} rows={2} value={draft.b} onChange={(e) => setDraft({ ...draft, b: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={cancel}>Cancelar</Button>
            <Button size="sm" onClick={save}>Salvar</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 && !adding ? (
        <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className="via-card space-y-2 p-3">
                <Input value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value })} />
                <Textarea rows={2} value={draft.b} onChange={(e) => setDraft({ ...draft, b: e.target.value })} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={cancel}>
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                  <Button size="sm" onClick={save}>Salvar</Button>
                </div>
              </li>
            ) : (
              <li key={item.id} className="group via-card flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{item.a}</p>
                  <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{item.b}</p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(item)} aria-label="Editar">
                    <Pencil className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(item.id)} aria-label="Remover">
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
