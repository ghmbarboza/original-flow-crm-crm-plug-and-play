import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Upload } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import { useImportProducts } from "@/hooks/useProducts";

const FIELDS = [
  { key: "name", label: "Nome" },
  { key: "description", label: "Descrição" },
  { key: "price", label: "Preço" },
  { key: "is_active", label: "Ativo" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
const IGNORE = "__ignore__";

/** Casa cabeçalhos do arquivo com os campos, sem depender de acento ou caixa. */
function guessField(header: string): FieldKey | typeof IGNORE {
  const normalized = header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  const guesses: Record<string, FieldKey> = {
    nome: "name",
    produto: "name",
    name: "name",
    descricao: "description",
    description: "description",
    preco: "price",
    valor: "price",
    price: "price",
    ativo: "is_active",
    active: "is_active",
    is_active: "is_active",
  };
  return guesses[normalized] ?? IGNORE;
}

interface RowError {
  line: number;
  reason: string;
}

/** Reconhece variações comuns de "verdadeiro" no CSV. */
function parseBool(raw: string): boolean {
  return ["1", "true", "sim", "ativo", "yes", "y", "s"].includes(raw.toLowerCase());
}

/** Aceita "1.999,90" (pt-BR) e "1999.90". */
function parsePrice(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function ProductImportDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importProducts = useImportProducts();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [lineNumbers, setLineNumbers] = useState<number[]>([]);
  const [mapping, setMapping] = useState<Record<number, FieldKey | typeof IGNORE>>({});

  const reset = () => {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setLineNumbers([]);
    setMapping({});
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      toast.error("O arquivo está vazio ou não é um CSV válido.");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setLineNumbers(parsed.lineNumbers);
    setMapping(Object.fromEntries(parsed.headers.map((h, i) => [i, guessField(h)])));
    event.target.value = "";
  };

  const { valid, errors } = useMemo(() => {
    const valid: Record<string, unknown>[] = [];
    const errors: RowError[] = [];

    const mapped = Object.entries(mapping).filter(([, field]) => field !== IGNORE);
    if (mapped.length === 0) return { valid, errors };

    rows.forEach((row, index) => {
      const line = lineNumbers[index] ?? index + 2;
      const product: Record<string, unknown> = { is_active: true };

      for (const [colIndex, field] of mapped) {
        const raw = (row[Number(colIndex)] ?? "").trim();
        if (!raw) continue;

        if (field === "price") {
          const price = parsePrice(raw);
          if (price === null) {
            errors.push({ line, reason: `Preço inválido: "${raw}".` });
            return;
          }
          product.price = price;
        } else if (field === "is_active") {
          product.is_active = parseBool(raw);
        } else {
          product[field] = raw;
        }
      }

      if (!product.name) {
        errors.push({ line, reason: "Sem nome — o produto precisa de um nome." });
        return;
      }
      valid.push(product);
    });

    return { valid, errors };
  }, [rows, lineNumbers, mapping]);

  const handleImport = async () => {
    try {
      const { inserted } = await importProducts.mutateAsync(valid as never);
      toast.success(
        errors.length > 0
          ? `${inserted} produtos importados. ${errors.length} linha(s) ignorada(s).`
          : `${inserted} produtos importados.`,
      );
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Falha ao importar: ${error.message}`
          : "Falha ao importar. Verifique o arquivo e tente de novo.",
      );
    }
  };

  const downloadTemplate = () => {
    downloadCsv(
      "modelo-produtos.csv",
      toCsv(
        ["Nome", "Descrição", "Preço", "Ativo"],
        [["Plano Pro", "Assinatura mensal", "199,90", "sim"]],
      ),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar produtos</DialogTitle>
          <DialogDescription>
            Envie um CSV, confira o mapeamento das colunas e importe. Nada é gravado antes de você confirmar.
          </DialogDescription>
        </DialogHeader>

        {headers.length === 0 ? (
          <div className="space-y-4 py-6 text-center">
            <label className="block cursor-pointer">
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
              <span className="via-card mx-auto flex max-w-sm flex-col items-center gap-2 p-8">
                <Upload className="h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  Escolher arquivo CSV
                </span>
                <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Separador vírgula ou ponto e vírgula
                </span>
              </span>
            </label>
            <Button variant="ghost" size="sm" onClick={downloadTemplate} className="gap-2">
              <Download className="h-4 w-4" strokeWidth={1.5} />
              Baixar modelo
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              <span className="font-medium">{fileName}</span> · {rows.length} linha(s)
            </p>

            <div className="space-y-2">
              <Label>Mapeamento de colunas</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {headers.map((header, index) => (
                  <div key={`${header}-${index}`} className="flex items-center gap-2">
                    <span
                      className="w-32 shrink-0 truncate text-sm"
                      style={{ color: "var(--via-text-body)" }}
                      title={header}
                    >
                      {header || "(sem título)"}
                    </span>
                    <Select
                      value={mapping[index] ?? IGNORE}
                      onValueChange={(value) =>
                        setMapping({ ...mapping, [index]: value as FieldKey | typeof IGNORE })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE}>Ignorar coluna</SelectItem>
                        {FIELDS.map((field) => (
                          <SelectItem key={field.key} value={field.key}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {errors.length > 0 && (
              <div className="via-card space-y-2 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-via-coral">
                  <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
                  {errors.length} linha(s) não serão importadas
                </p>
                <div className="max-h-32 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Linha</TableHead>
                        <TableHead>Motivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errors.slice(0, 20).map((error) => (
                        <TableRow key={error.line}>
                          <TableCell>{error.line}</TableCell>
                          <TableCell className="text-sm">{error.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {errors.length > 20 && (
                    <p className="p-2 text-xs" style={{ color: "var(--via-text-muted)" }}>
                      e mais {errors.length - 20}…
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={valid.length === 0 || importProducts.isPending}>
            {importProducts.isPending ? "Importando…" : `Importar ${valid.length} produto(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
