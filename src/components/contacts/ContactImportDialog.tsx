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
import { useImportContacts, type ContactStatus } from "@/hooks/useContacts";

/** Campos do contato que a importação sabe preencher. */
const FIELDS = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Sobrenome" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefone" },
  { key: "whatsapp_phone", label: "WhatsApp" },
  { key: "title", label: "Cargo" },
  { key: "status", label: "Status" },
  { key: "source", label: "Origem" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const IGNORE = "__ignore__";
const VALID_STATUS: ContactStatus[] = ["lead", "prospect", "customer", "churned"];

/** Casa cabeçalhos do arquivo com os campos, sem depender de acento ou caixa. */
function guessField(header: string): FieldKey | typeof IGNORE {
  const normalized = header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  const guesses: Record<string, FieldKey> = {
    nome: "first_name",
    "primeiro nome": "first_name",
    first_name: "first_name",
    sobrenome: "last_name",
    last_name: "last_name",
    email: "email",
    "e-mail": "email",
    telefone: "phone",
    fone: "phone",
    phone: "phone",
    celular: "whatsapp_phone",
    whatsapp: "whatsapp_phone",
    whatsapp_phone: "whatsapp_phone",
    cargo: "title",
    title: "title",
    status: "status",
    origem: "source",
    source: "source",
  };
  return guesses[normalized] ?? IGNORE;
}

interface RowError {
  line: number;
  reason: string;
}

export function ContactImportDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importContacts = useImportContacts();
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
    // Permite reimportar o mesmo arquivo depois de corrigi-lo.
    event.target.value = "";
  };

  /** Converte as linhas do arquivo em contatos, separando o que não dá para importar. */
  const { valid, errors } = useMemo(() => {
    const valid: Record<string, unknown>[] = [];
    const errors: RowError[] = [];

    const mapped = Object.entries(mapping).filter(([, field]) => field !== IGNORE);
    if (mapped.length === 0) return { valid, errors };

    rows.forEach((row, index) => {
      // Linha física no arquivo: é o número que o usuário vê ao abrir a planilha.
      const line = lineNumbers[index] ?? index + 2;
      const contact: Record<string, unknown> = {};

      for (const [colIndex, field] of mapped) {
        const raw = (row[Number(colIndex)] ?? "").trim();
        if (!raw) continue;

        if (field === "status") {
          const status = raw.toLowerCase() as ContactStatus;
          if (!VALID_STATUS.includes(status)) {
            errors.push({
              line,
              reason: `Status "${raw}" não existe. Use: ${VALID_STATUS.join(", ")}.`,
            });
            return;
          }
          contact.status = status;
        } else {
          contact[field] = raw;
        }
      }

      const hasIdentity = contact.first_name || contact.email || contact.whatsapp_phone;
      if (!hasIdentity) {
        errors.push({ line, reason: "Sem nome, email ou WhatsApp — não dá para identificar." });
        return;
      }

      if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(contact.email))) {
        errors.push({ line, reason: `Email inválido: "${contact.email}".` });
        return;
      }

      if (!contact.first_name) contact.first_name = "";
      valid.push(contact);
    });

    return { valid, errors };
  }, [rows, lineNumbers, mapping]);

  const handleImport = async () => {
    try {
      const { inserted } = await importContacts.mutateAsync(valid as never);
      toast.success(
        errors.length > 0
          ? `${inserted} contatos importados. ${errors.length} linha(s) ignorada(s).`
          : `${inserted} contatos importados.`,
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
      "modelo-contatos.csv",
      toCsv(
        ["Nome", "Sobrenome", "Email", "Telefone", "WhatsApp", "Cargo", "Status", "Origem"],
        [["Maria", "Souza", "maria@empresa.com", "1133334444", "5511999999999", "Diretora", "lead", "Indicação"]],
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
          <DialogTitle>Importar contatos</DialogTitle>
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
          <Button
            onClick={handleImport}
            disabled={valid.length === 0 || importContacts.isPending}
          >
            {importContacts.isPending ? "Importando…" : `Importar ${valid.length} contato(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
