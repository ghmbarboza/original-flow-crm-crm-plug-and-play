import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart2, Download, Printer } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useReports } from "@/hooks/useReports";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import { VIA_CHART_COLORS, VIA } from "@/lib/via-colors";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatCurrency } from "@/lib/format";

const ALL = "__all__";
const PERIODS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
];

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="via-card p-4">
      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{label}</p>
      <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="via-card p-5">
      <h2 className="mb-3 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>{title}</h2>
      {children}
    </div>
  );
}

export default function ReportsPage() {
  const { data: members } = useOrgMembers();
  const [period, setPeriod] = useState("30");
  const [owner, setOwner] = useState(ALL);

  const filters = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(period) * 86400_000);
    return { from: from.toISOString(), to: to.toISOString(), ownerId: owner === ALL ? null : owner };
  }, [period, owner]);

  const { data, isLoading, error } = useReports(filters);

  const conversationPie = useMemo(() => {
    if (!data) return [];
    return [
      { name: "IA", value: data.conversations.ai, color: VIA.navy },
      { name: "Humano", value: data.conversations.human, color: VIA.blue },
      { name: "Encerradas", value: data.conversations.closed, color: VIA.gray300 },
    ].filter((d) => d.value > 0);
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      "relatorio-deals-por-etapa.csv",
      toCsv(
        ["Etapa", "Quantidade", "Valor"],
        data.deals.byStage.map((s) => [s.stage, s.count, s.value]),
      ),
    );
    toast.success("CSV exportado.");
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BarChart2 className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
              Relatórios
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os owners</SelectItem>
                {(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} className="gap-1.5">
              <Download className="h-4 w-4" strokeWidth={1.5} />
              CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" strokeWidth={1.5} />
              PDF
            </Button>
          </div>
        </div>

        {error && (
          <div className="via-card p-4">
            <p className="text-sm font-medium text-via-coral">Não foi possível carregar os relatórios</p>
            <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
              {error instanceof Error ? error.message : "Erro desconhecido."}
            </p>
          </div>
        )}

        {isLoading || !data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KPI label="Negócios ganhos" value={String(data.deals.won)} />
              <KPI label="Receita ganha" value={formatCurrency(data.deals.wonValue)} />
              <KPI label="Forecast (aberto)" value={formatCurrency(data.deals.forecast)} />
              <KPI label="Leads gerados" value={String(data.leads.total)} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Negócios por etapa">
                {data.deals.byStage.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>Sem dados no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.deals.byStage}>
                      <XAxis dataKey="stage" tick={{ fontSize: 12, fill: VIA.gray500 }} />
                      <YAxis tick={{ fontSize: 12, fill: VIA.gray500 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Negócios" radius={[4, 4, 0, 0]}>
                        {data.deals.byStage.map((s, i) => <Cell key={i} fill={s.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Atendimento: IA x Humano">
                {conversationPie.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>Sem conversas no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={conversationPie} dataKey="value" nameKey="name" outerRadius={90} label>
                        {conversationPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Leads por origem">
                {data.leads.bySource.length === 0 ? (
                  <p className="py-8 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>Sem leads no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.leads.bySource} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 12, fill: VIA.gray500 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="source" width={120} tick={{ fontSize: 12, fill: VIA.gray500 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}>
                        {data.leads.bySource.map((_, i) => <Cell key={i} fill={VIA_CHART_COLORS[i % VIA_CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Resumo de conversas">
                <div className="grid grid-cols-2 gap-3">
                  <KPI label="Total" value={String(data.conversations.total)} />
                  <KPI label="Abertas" value={String(data.conversations.open)} />
                  <KPI label="Encerradas" value={String(data.conversations.closed)} />
                  <KPI label="Em atendimento humano" value={String(data.conversations.human)} />
                </div>
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
