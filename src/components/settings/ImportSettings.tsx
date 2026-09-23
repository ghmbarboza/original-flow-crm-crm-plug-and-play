import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CrmConnectPanel from "@/components/settings/CrmConnectPanel";
import { ErrorState } from "@/components/ErrorState";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { useStages } from "@/hooks/useDeals";
import { useImports, useRunImport, useUndoImport, type ResultadoImportacao } from "@/hooks/useImportacao";
import {
  CAMPOS_POR_ENTIDADE, CUSTOM_PREFIX, IGNORAR, IMPORT_KIND_LABELS, IMPORT_SOURCE_LABELS, linhaParaRegistro, mapearColunas,
  sugerirEtapa, valoresDistintos, type ImportKind, type ImportSource,
} from "@/lib/importacao";

const NAO_MAPEAR = "__none__";
const STATUS_LABEL: Record<string, string> = { pending: "Pendente", processing: "Em andamento", completed: "Concluída", failed: "Falhou", undone: "Desfeita" };

const SECOES = ["arquivo", "crm", "historico"] as const;
type Secao = (typeof SECOES)[number];

/**
 * Configurações > Importação, em três sub-abas: Arquivo CSV (assistente em
 * quatro passos), Conectar CRM (HubSpot, Pipedrive, RD Station, Agendor,
 * Kommo, Salesforce) e Histórico (desfazer e relatório de erros).
 */
export default function ImportSettings() {
  const [params, setParams] = useSearchParams();
  const secaoParam = params.get("secao");
  const secao: Secao = (SECOES as readonly string[]).includes(secaoParam ?? "") ? (secaoParam as Secao) : "arquivo";
  const trocar = (valor: string) => {
    const proximos = new URLSearchParams(params);
    proximos.set("secao", valor);
    setParams(proximos, { replace: true });
  };
  const { data: importacoes, isLoading, error } = useImports();
  const desfazer = useUndoImport();
  const rodar = useRunImport();
  const { data: stages } = useStages();

  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const [kind, setKind] = useState<ImportKind>("contacts");
  const [source, setSource] = useState<ImportSource>("csv");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [lineNumbers, setLineNumbers] = useState<number[]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [mapaEtapas, setMapaEtapas] = useState<Record<string, string>>({});
  const [progresso, setProgresso] = useState<[number, number] | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  const campos = CAMPOS_POR_ENTIDADE[kind];
  const colunaEtapa = useMemo(() => Object.entries(mapping).find(([, campo]) => campo === "stage")?.[0], [mapping]);
  const etapasOrigem = useMemo(() => (kind === "deals" && colunaEtapa !== undefined ? valoresDistintos(rows, Number(colunaEtapa)) : []), [kind, colunaEtapa, rows]);

  const lerArquivo = async (file: File | undefined) => {
    if (!file) return;
    const texto = await file.text();
    const parsed = parseCsv(texto);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      toast.error("O arquivo está vazio ou sem cabeçalho.");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setLineNumbers(parsed.lineNumbers);
    const auto = mapearColunas(parsed.headers, kind, source);
    setMapping(auto);
    setMapaEtapas({});
    setResultado(null);
    setPasso(2);
  };

  const remapear = (novaKind: ImportKind, novaSource: ImportSource) => {
    setKind(novaKind);
    setSource(novaSource);
    if (headers.length) setMapping(mapearColunas(headers, novaKind, novaSource));
  };

  const irParaPrevia = () => {
    if (kind === "deals" && etapasOrigem.length && stages?.length) {
      const sugestoes: Record<string, string> = { ...mapaEtapas };
      for (const nome of etapasOrigem) if (!sugestoes[nome]) { const s = sugerirEtapa(nome, stages); if (s) sugestoes[nome] = s; }
      setMapaEtapas(sugestoes);
    }
    setPasso(3);
  };

  const executar = async () => {
    setProgresso([0, rows.length]);
    try {
      const r = await rodar.mutateAsync({
        kind, source, fileName, headers, rows, lineNumbers, mapping, stages: mapaEtapas,
        onProgresso: (feitas, total) => setProgresso([feitas, total]),
      });
      setResultado(r);
      setPasso(4);
      toast.success(`Importação concluída: ${r.created} criados, ${r.updated} atualizados, ${r.error} com erro.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "A importação falhou.");
    } finally {
      setProgresso(null);
    }
  };

  const recomecar = () => {
    setPasso(1);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setMapaEtapas({});
    setResultado(null);
  };

  const desfazerImportacao = async (id: string) => {
    try {
      const r = await desfazer.mutateAsync(id);
      toast.success(`Desfeito: ${r.contacts ?? 0} contatos, ${r.companies ?? 0} empresas, ${r.deals ?? 0} negócios, ${r.activities ?? 0} atividades apagados.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível desfazer.");
    }
  };

  const previa = rows.slice(0, 5).map((row) => linhaParaRegistro(headers, mapping, row));
  const mapeados = Object.values(mapping).filter((v) => v !== IGNORAR).length;

  if (error) return <ErrorState title="Não foi possível carregar as importações" error={error} />;

  return (
    <Tabs value={secao} onValueChange={trocar} className="space-y-4" data-testid="import-settings">
      <TabsList>
        <TabsTrigger data-testid="import-section" value="arquivo">Arquivo CSV</TabsTrigger>
        <TabsTrigger data-testid="import-section" value="crm">Conectar CRM</TabsTrigger>
        <TabsTrigger data-testid="import-section" value="historico">Histórico</TabsTrigger>
      </TabsList>

      <TabsContent value="crm"><CrmConnectPanel /></TabsContent>

      <TabsContent value="arquivo">
      <div className="via-card space-y-4 p-5">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Importar de outro CRM ou planilha</h2>
        </div>
        <ol className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--via-text-muted)" }}>
          {["Arquivo", "De/para", "Prévia", "Resultado"].map((r, i) => (
            <li key={r} style={{ color: passo === i + 1 ? "var(--via-text-primary)" : undefined, fontWeight: passo === i + 1 ? 600 : 400 }}>{i + 1}. {r}</li>
          ))}
        </ol>

        {passo === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>O que você vai importar</Label>
                <Select value={kind} onValueChange={(v) => remapear(v as ImportKind, source)}>
                  <SelectTrigger aria-label="Entidade" data-testid="import-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(IMPORT_KIND_LABELS) as ImportKind[]).map((k) => <SelectItem key={k} value={k}>{IMPORT_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>De onde vem o arquivo</Label>
                <Select value={source} onValueChange={(v) => remapear(kind, v as ImportSource)}>
                  <SelectTrigger aria-label="Origem" data-testid="import-source"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(IMPORT_SOURCE_LABELS) as ImportSource[]).map((s) => <SelectItem key={s} value={s}>{IMPORT_SOURCE_LABELS[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Exporte em CSV no sistema de origem (HubSpot, Pipedrive, RD Station, Agendor, Kommo, Salesforce, Ploomes, Bitrix24 ou qualquer planilha).
              Importe empresas antes de contatos e contatos antes de negócios para os vínculos baterem. Linhas com e-mail, telefone ou ID de origem já cadastrados são atualizadas, não duplicadas.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center" style={{ borderColor: "var(--via-border)" }}>
              <Upload className="h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
              <span className="text-sm" style={{ color: "var(--via-text-body)" }}>Escolher arquivo CSV</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => lerArquivo(e.target.files?.[0])} data-testid="import-file" />
            </label>
          </div>
        )}

        {passo === 2 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
              {fileName}: {rows.length} linha{rows.length === 1 ? "" : "s"}. Confira para onde vai cada coluna ({mapeados} mapeada{mapeados === 1 ? "" : "s"}).
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-40 truncate text-sm" style={{ color: "var(--via-text-primary)" }} title={h}>{h}</span>
                  <Select value={mapping[i] ?? IGNORAR} onValueChange={(v) => setMapping({ ...mapping, [i]: v })}>
                    <SelectTrigger className="h-8 flex-1" aria-label={`Destino da coluna ${h}`} data-testid={`import-map-${i}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={IGNORAR}>Ignorar</SelectItem>
                      {campos.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                      {kind !== "activities" && <SelectItem value={`${CUSTOM_PREFIX}${h.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`}>Campo extra "{h}"</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={recomecar}>Voltar</Button>
              <Button onClick={irParaPrevia} disabled={mapeados === 0} data-testid="import-next">Continuar</Button>
            </div>
          </div>
        )}

        {passo === 3 && (
          <div className="space-y-4">
            {kind === "deals" && etapasOrigem.length > 0 && (
              <div className="space-y-2">
                <Label>De/para de etapas</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {etapasOrigem.map((nome) => (
                    <div key={nome} className="flex items-center gap-2">
                      <span className="w-40 truncate text-sm" style={{ color: "var(--via-text-primary)" }} title={nome}>{nome}</span>
                      <Select value={mapaEtapas[nome] ?? NAO_MAPEAR} onValueChange={(v) => setMapaEtapas({ ...mapaEtapas, [nome]: v === NAO_MAPEAR ? "" : v })}>
                        <SelectTrigger className="h-8 flex-1" aria-label={`Etapa para ${nome}`} data-testid={`import-stage-${nome}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NAO_MAPEAR}>Primeira etapa do funil</SelectItem>
                          {(stages ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Prévia (5 primeiras linhas)</Label>
              <div className="overflow-x-auto rounded-md border text-xs" style={{ borderColor: "var(--via-border)" }}>
                <table className="w-full">
                  <tbody>
                    {previa.map((r, i) => (
                      <tr key={i} className="border-b" style={{ borderColor: "var(--via-border)" }}>
                        <td className="p-2 align-top" style={{ color: "var(--via-text-body)" }}>
                          {Object.entries(r).map(([k, v]) => <span key={k} className="mr-3"><span style={{ color: "var(--via-text-muted)" }}>{k}:</span> {v}</span>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {progresso && (
              <p className="text-sm" style={{ color: "var(--via-text-body)" }} data-testid="import-progress">Importando {progresso[0]} de {progresso[1]}…</p>
            )}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setPasso(2)} disabled={rodar.isPending}>Voltar</Button>
              <Button onClick={executar} disabled={rodar.isPending} data-testid="import-run">{rodar.isPending ? "Importando…" : `Importar ${rows.length} linha${rows.length === 1 ? "" : "s"}`}</Button>
            </div>
          </div>
        )}

        {passo === 4 && resultado && (
          <div className="space-y-3" data-testid="import-result">
            <p className="text-sm" style={{ color: "var(--via-text-primary)" }}>
              {resultado.created} criado{resultado.created === 1 ? "" : "s"}, {resultado.updated} atualizado{resultado.updated === 1 ? "" : "s"}, {resultado.error} com erro.
            </p>
            {resultado.erros.length > 0 && (
              <ul className="max-h-40 overflow-y-auto text-xs" style={{ color: "var(--via-text-muted)" }}>
                {resultado.erros.slice(0, 20).map((e) => <li key={e.row_number}>Linha {e.row_number}: {e.error}</li>)}
              </ul>
            )}
            <Button variant="outline" onClick={recomecar}>Importar outro arquivo</Button>
          </div>
        )}
      </div>
      </TabsContent>

      <TabsContent value="historico">
      <div className="via-card space-y-3 p-5" data-testid="import-history">
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Importações feitas</h2>
        {isLoading ? <Skeleton className="h-12 w-full" /> : (importacoes ?? []).length === 0 ? (
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhuma importação ainda.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--via-border)" }}>
            {(importacoes ?? []).map((imp) => {
              const stats = (imp.stats ?? {}) as { total?: number; created?: number; updated?: number; error?: number };
              return (
                <li key={imp.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`import-${imp.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                      {IMPORT_KIND_LABELS[imp.kind as ImportKind]} · {IMPORT_SOURCE_LABELS[imp.source as ImportSource] ?? imp.source} · {imp.connection_id ? "sincronização" : imp.file_name ?? "sem nome"}
                    </p>
                    <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                      {formatDateTime(imp.created_at)} · {STATUS_LABEL[imp.status] ?? imp.status} · {stats.total ?? 0} linhas, {stats.created ?? 0} criados, {stats.updated ?? 0} atualizados, {stats.error ?? 0} erros
                    </p>
                  </div>
                  {imp.error_report && imp.status === "completed" && (
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => downloadCsv(`erros-${imp.file_name ?? "importacao"}.csv`, imp.error_report!)}>
                      <Download className="h-4 w-4" strokeWidth={1.5} /> Erros
                    </Button>
                  )}
                  {imp.status === "completed" && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => desfazerImportacao(imp.id)} disabled={desfazer.isPending} data-testid="import-undo">
                      <Undo2 className="h-4 w-4" strokeWidth={1.5} /> Desfazer
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      </TabsContent>
    </Tabs>
  );
}
