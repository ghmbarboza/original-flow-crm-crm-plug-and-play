import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import { parseImportRows, type ImportMapping } from "@/lib/conversation-import";
import { useRunConversationImport } from "@/hooks/useConversationImport";

const SOURCES = [
  { value: "flowcrm_csv", label: "CSV genérico (formato FlowCRM)" },
  { value: "chatwoot", label: "Chatwoot (exportação CSV)" },
  { value: "zendesk", label: "Zendesk (exportação CSV)" },
  { value: "intercom", label: "Intercom (exportação CSV)" },
  { value: "csv_livre", label: "Outro (CSV livre com mapeamento manual)" },
] as const;

const FIELDS = [
  { key: "phone", label: "Telefone" },
  { key: "date", label: "Data e hora" },
  { key: "direction", label: "Direção (inbound/outbound)" },
  { key: "content", label: "Mensagem" },
  { key: "name", label: "Nome do contato (opcional)" },
] as const;

const IGNORE = -1;

/** Chuta o campo pelo cabeçalho, sem depender de caixa ou acento. */
function guessField(header: string): (typeof FIELDS)[number]["key"] | null {
  const h = header.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (/(telefone|phone|celular|whatsapp|numero)/.test(h)) return "phone";
  if (/(data|date|timestamp|created|hora|sent)/.test(h)) return "date";
  if (/(dire|direction|type|tipo|sender|autor|from)/.test(h)) return "direction";
  if (/(mensagem|message|content|body|texto|text)/.test(h)) return "content";
  if (/(nome|name|contact)/.test(h)) return "name";
  return null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Wizard de importação de histórico de conversas (Parte 6 do Sprint 10B):
 * origem → upload + mapeamento → revisão. Tudo em CSV — os tutoriais de cada
 * plataforma explicam como exportar nesse formato.
 */
export function ImportHistoryDialog({ open, onOpenChange }: Props) {
  const importar = useRunConversationImport();

  const [step, setStep] = useState(1);
  const [source, setSource] = useState<string>("flowcrm_csv");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [lineNumbers, setLineNumbers] = useState<number[]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});

  const reset = () => {
    setStep(1);
    setSource("flowcrm_csv");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setLineNumbers([]);
    setMapping({});
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0) {
      toast.error("O arquivo está vazio ou não é um CSV válido.");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setLineNumbers(parsed.lineNumbers);
    const guessed: Record<string, number> = {};
    parsed.headers.forEach((h, i) => {
      const field = guessField(h);
      if (field && guessed[field] === undefined) guessed[field] = i;
    });
    setMapping(guessed);
  };

  const mappingComplete =
    mapping.phone !== undefined && mapping.phone !== IGNORE &&
    mapping.date !== undefined && mapping.date !== IGNORE &&
    mapping.direction !== undefined && mapping.direction !== IGNORE &&
    mapping.content !== undefined && mapping.content !== IGNORE;

  const parsed = useMemo(() => {
    if (!mappingComplete || rows.length === 0) return null;
    const m: ImportMapping = {
      phone: mapping.phone,
      date: mapping.date,
      direction: mapping.direction,
      content: mapping.content,
      ...(mapping.name !== undefined && mapping.name !== IGNORE ? { name: mapping.name } : {}),
    };
    return parseImportRows(rows, lineNumbers, m);
  }, [rows, lineNumbers, mapping, mappingComplete]);

  const confirmar = async () => {
    if (!parsed || parsed.conversations.length === 0) return;
    try {
      const result = await importar.mutateAsync({
        sourcePlatform: source,
        fileName,
        conversations: parsed.conversations,
        totalMessages: parsed.totalMessages,
      });
      toast.success(`${result.imported} conversa(s) e ${result.messages} mensagem(ns) importadas.`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? `Falha na importação: ${e.message}` : "Falha na importação.");
    }
  };

  const downloadTemplate = () => {
    downloadCsv(
      "modelo-historico-conversas.csv",
      toCsv(
        ["Telefone", "Data", "Direcao", "Mensagem", "Nome"],
        [
          ["5511999998888", "2026-07-01 09:00", "inbound", "Olá, quero saber mais", "Maria Souza"],
          ["5511999998888", "2026-07-01 09:05", "outbound", "Claro! Posso te ajudar…", "Maria Souza"],
        ],
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
      <DialogContent className="max-w-2xl" data-testid="import-history-dialog">
        <DialogHeader>
          <DialogTitle>Importar histórico de conversas · passo {step} de 3</DialogTitle>
          <DialogDescription>
            Conversas importadas entram como "Encerradas", não recebem respostas da IA e ficam
            fora do SLA e das automações de kanban.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                De onde vem o histórico?
              </legend>
              {SOURCES.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
                  <input
                    type="radio"
                    name="import-source"
                    checked={source === s.value}
                    onChange={() => setSource(s.value)}
                    data-testid={`import-source-${s.value}`}
                  />
                  {s.label}
                </label>
              ))}
            </fieldset>

            <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--via-border)", color: "var(--via-text-body)" }}>
              <p className="mb-1 font-medium" style={{ color: "var(--via-text-primary)" }}>Como exportar</p>
              <p className="mb-2">
                <strong>Chatwoot:</strong> Configurações → Importar/Exportar → "Exportar conversas"
                em CSV e envie o arquivo aqui.
              </p>
              <p className="mb-2">
                <strong>Zendesk / Intercom:</strong> exporte as conversas em CSV pela área de
                relatórios da plataforma; no próximo passo você mapeia as colunas manualmente.
              </p>
              <p>
                <strong>WhatsApp Web:</strong> não é possível importar diretamente. O FlowCRM
                recebe mensagens em tempo real pelo provedor conectado.
              </p>
            </div>

            <Button variant="ghost" size="sm" onClick={downloadTemplate} className="gap-1.5">
              <Download className="h-4 w-4" strokeWidth={1.5} />
              Baixar template CSV
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {headers.length === 0 ? (
              <label className="block cursor-pointer">
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} data-testid="import-file" />
                <span className="via-card mx-auto flex max-w-sm flex-col items-center gap-2 p-8">
                  <Upload className="h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                    Escolher arquivo CSV
                  </span>
                </span>
              </label>
            ) : (
              <>
                <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                  <span className="font-medium">{fileName}</span> · {rows.length} linha(s)
                </p>
                <div className="space-y-2">
                  <Label>Mapeamento de colunas</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {FIELDS.map((field) => (
                      <div key={field.key} className="flex items-center gap-2">
                        <span className="w-40 shrink-0 text-sm" style={{ color: "var(--via-text-body)" }}>{field.label}</span>
                        <Select
                          value={String(mapping[field.key] ?? IGNORE)}
                          onValueChange={(v) => setMapping({ ...mapping, [field.key]: Number(v) })}
                        >
                          <SelectTrigger className="h-8" aria-label={`Coluna para ${field.label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={String(IGNORE)}>—</SelectItem>
                            {headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>{h || `Coluna ${i + 1}`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Preview das primeiras linhas. */}
                <div className="max-h-40 overflow-auto rounded border text-xs" style={{ borderColor: "var(--via-border)" }}>
                  <table className="w-full">
                    <thead>
                      <tr>{headers.map((h, i) => <th key={i} className="p-1.5 text-left font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, ri) => (
                        <tr key={ri} className="border-t" style={{ borderColor: "var(--via-border)" }}>
                          {headers.map((_h, ci) => (
                            <td key={ci} className="max-w-40 truncate p-1.5">{row[ci]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && parsed && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="via-card p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>{parsed.conversations.length}</p>
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>conversas</p>
              </div>
              <div className="via-card p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>{parsed.totalMessages}</p>
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>mensagens</p>
              </div>
              <div className="via-card p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums" style={{ color: parsed.errors.length ? "var(--via-coral)" : "var(--via-text-primary)" }}>{parsed.errors.length}</p>
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>linhas ignoradas</p>
              </div>
            </div>

            {parsed.errors.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded border p-2 text-xs" style={{ borderColor: "var(--via-border)", color: "var(--via-text-body)" }}>
                {parsed.errors.slice(0, 15).map((e) => (
                  <p key={e.line}>Linha {e.line}: {e.reason}</p>
                ))}
                {parsed.errors.length > 15 && <p>e mais {parsed.errors.length - 15}…</p>}
              </div>
            )}

            <p className="flex items-start gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-via-coral" strokeWidth={1.5} aria-hidden />
              Conversas importadas serão marcadas como "Encerradas" e não receberão respostas da IA.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>Voltar</Button>
          )}
          {step === 1 && (
            <Button onClick={() => setStep(2)} data-testid="import-next">Continuar</Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!mappingComplete || rows.length === 0} data-testid="import-next">
              Revisar
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={confirmar}
              disabled={!parsed || parsed.conversations.length === 0 || importar.isPending}
              data-testid="import-confirm"
            >
              {importar.isPending ? "Importando…" : `Importar ${parsed?.conversations.length ?? 0} conversa(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
