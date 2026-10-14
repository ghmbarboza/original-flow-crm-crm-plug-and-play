import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowRight, Bot, Building2, CheckCheck, Download, MessageCircle, Printer, TrendingUp, Trophy, UserRound, Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { ChartCard, KPI, SemDados, StatRow } from "@/components/dashboard/PainelCards";
import { NpsCard } from "@/components/dashboard/NpsCard";
import { SlaCard } from "@/components/dashboard/SlaCard";
import { ChannelBadge, channelMeta } from "@/components/whatsapp/ChannelBadge";
import { useAuth } from "@/hooks/useAuth";
import { useReports } from "@/hooks/useReports";
import { useAiForecast } from "@/hooks/useDealPrediction";
import { useNpsReport } from "@/hooks/useNps";
import { useSlaReport } from "@/hooks/useSlaReport";
import { useOrgMemberNames, useOrgMembers } from "@/hooks/useOrgMembers";
import { useActiveChannels } from "@/hooks/useActiveChannels";
import { VIA, VIA_CHART_COLORS } from "@/lib/via-colors";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatCurrency } from "@/lib/format";

const ALL = "__all__";
const TODO_PERIODO = "tudo";
const UM_DIA_MS = 86_400_000;
const PERIODS = [
  { value: TODO_PERIODO, label: "Todo o período" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
];

/**
 * Painel único do CRM. Dashboard e Relatórios eram duas telas com os mesmos
 * números (contatos/leads, forecast, receita, atendimento); juntaram em uma, com
 * os filtros de Relatórios e cada métrica aparecendo uma vez só. /reports
 * redireciona para cá.
 */
export default function DashboardPage() {
  const { profile, role } = useAuth();
  const { data: members } = useOrgMembers();
  // Só os canais conectados aparecem no filtro: canal sem conexão não dá resultado.
  const { channels: canaisConectados } = useActiveChannels();
  const [period, setPeriod] = useState(TODO_PERIODO);
  const [owner, setOwner] = useState(ALL);
  const [channel, setChannel] = useState(ALL);

  const filters = useMemo(() => {
    // "to" um dia à frente: o que entrou hoje, depois de abrir a tela, também conta.
    const to = new Date(Date.now() + UM_DIA_MS);
    const from = period === TODO_PERIODO ? new Date(0) : new Date(Date.now() - Number(period) * UM_DIA_MS);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      ownerId: owner === ALL ? null : owner,
      channel: channel === ALL ? null : channel,
    };
  }, [period, owner, channel]);

  const { data, isLoading, error } = useReports(filters);
  const { data: sla } = useSlaReport(filters);
  const { data: aiForecast } = useAiForecast();
  const { data: nps } = useNpsReport(filters);
  const nomes = useOrgMemberNames();

  const filtrado = period !== TODO_PERIODO || owner !== ALL || channel !== ALL;
  const semNadaCadastrado =
    !!data && !filtrado && data.leads.total === 0 && data.deals.byStage.length === 0 && data.conversations.total === 0;

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      "relatorio-deals-por-etapa.csv",
      toCsv(["Etapa", "Quantidade", "Valor"], data.deals.byStage.map((s) => [s.stage, s.count, s.value])),
    );
    toast.success("CSV exportado.");
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1
                className="font-display text-3xl font-medium tracking-tight"
                style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
              >
                Dashboard
              </h1>
              {role && <Badge variant="secondary" className="capitalize">{role}</Badge>}
            </div>
            <p style={{ color: "var(--via-text-body)" }}>
              Bem-vindo{profile?.full_name ? `, ${profile.full_name}` : ""}! Aqui está o panorama do seu CRM.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40" data-testid="reports-period" aria-label="Período"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="w-44" aria-label="Filtrar por responsável"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os usuários</SelectItem>
                {(members ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-40" data-testid="reports-channel" aria-label="Filtrar por canal"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os canais</SelectItem>
                {canaisConectados.map((ch) => <SelectItem key={ch} value={ch}>{channelMeta(ch).label}</SelectItem>)}
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

        {error && <ErrorState title="Não foi possível carregar o painel" error={error} />}

        {isLoading || !data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
            <Skeleton className="h-72 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KPI label={filtrado ? "Leads no período" : "Contatos"} value={String(data.leads.total)} icon={UserRound} accent={VIA.navy} />
              <KPI label="Negócios abertos" value={String(data.deals.open)} icon={TrendingUp} accent={VIA.blue} />
              <KPI label="Em aberto (forecast)" value={formatCurrency(data.deals.forecast)} icon={Wallet} accent={VIA.blue} />
              <KPI
                label="Receita ganha"
                value={formatCurrency(data.deals.wonValue)}
                detalhe={data.deals.won === 1 ? "1 negócio ganho" : `${data.deals.won} negócios ganhos`}
                icon={Trophy}
                accent={VIA.success}
              />
            </div>

            {semNadaCadastrado ? (
              <PainelVazio ehAdmin={role === "admin"} />
            ) : (
              <>
                {/* Forecast ponderado pela previsão de IA (Parte 3 do Sprint 10B). */}
                {aiForecast && aiForecast.covered > 0 && (
                  <div className="via-card flex flex-wrap items-baseline justify-between gap-2 p-4" data-testid="ai-forecast">
                    <div>
                      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>Forecast ponderado pela IA</p>
                      <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>
                        {formatCurrency(aiForecast.weighted)}
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                      Soma de valor × probabilidade de fechamento dos negócios abertos. {aiForecast.covered} de{" "}
                      {aiForecast.open} negócio(s) com previsão calculada; a previsão é gerada quando o negócio é aberto na tela.
                    </p>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <ChartCard title="Negócios por etapa">
                      {data.deals.byStage.length === 0 ? (
                        <SemDados>Sem negócios no período.</SemDados>
                      ) : (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={data.deals.byStage}>
                            <XAxis dataKey="stage" tick={{ fontSize: 12, fill: VIA.gray500 }} />
                            <YAxis tick={{ fontSize: 12, fill: VIA.gray500 }} allowDecimals={false} />
                            <Tooltip
                              formatter={(v: number, _n, p) =>
                                [`${v} (${formatCurrency((p?.payload as { value?: number })?.value ?? 0)})`, "Negócios"]
                              }
                            />
                            <Bar dataKey="count" name="Negócios" radius={[4, 4, 0, 0]}>
                              {data.deals.byStage.map((s, i) => <Cell key={i} fill={s.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </ChartCard>
                  </div>

                  <ChartCard title="Atendimento">
                    <div className="flex-1 divide-y" style={{ borderColor: "var(--via-border)" }} data-testid="painel-atendimento">
                      <StatRow label="Conversas" value={data.conversations.total} icon={MessageCircle} />
                      <StatRow label="Em aberto" value={data.conversations.open} icon={MessageCircle} />
                      <StatRow label="IA ativa" value={data.conversations.ai} icon={Bot} />
                      <StatRow label="Com humano" value={data.conversations.human} icon={UserRound} />
                      <StatRow label="Encerradas" value={data.conversations.closed} icon={CheckCheck} />
                    </div>
                    <Button asChild variant="outline" size="sm" className="mt-4 w-full gap-1.5">
                      <Link to="/whatsapp">
                        Abrir atendimento <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                      </Link>
                    </Button>
                  </ChartCard>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <ChartCard title="Leads por origem">
                    {data.leads.bySource.length === 0 ? (
                      <SemDados>Sem leads no período.</SemDados>
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

                  <ChartCard title="Conversas e conversão por canal">
                    <ConversaoPorCanal conversao={data.conversion} />
                  </ChartCard>
                </div>

                {nps && nps.surveysSent > 0 && <NpsCard nps={nps} nomes={nomes} />}
                {sla && <SlaCard sla={sla} nomes={nomes} />}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function PainelVazio({ ehAdmin }: { ehAdmin: boolean }) {
  return (
    <div className="via-card flex flex-col items-center gap-4 p-10 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "var(--via-surface)", color: "var(--via-text-muted)" }}
      >
        <Building2 className="h-7 w-7" strokeWidth={1.5} />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-medium" style={{ color: "var(--via-text-primary)" }}>Ainda não há dados por aqui</h2>
        <p className="mx-auto max-w-md text-sm" style={{ color: "var(--via-text-muted)" }}>
          Cadastre seus primeiros contatos e negócios, ou carregue dados de exemplo em
          Configurações → Demonstração para ver o painel completo.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link to="/contacts">Adicionar contato</Link>
        </Button>
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/deals">Criar negócio <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Link>
        </Button>
        {ehAdmin && (
          <Button asChild variant="ghost">
            <Link to="/settings/inicio#demonstracao">Carregar dados de exemplo</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Conversas, negócios e taxa por canal numa tabela só (antes o número de
 * conversas por canal aparecia também num gráfico à parte).
 */
function ConversaoPorCanal({ conversao }: { conversao: NonNullable<ReturnType<typeof useReports>["data"]>["conversion"] }) {
  if (conversao.byChannel.length === 0) return <SemDados>Sem conversas no período.</SemDados>;
  const borda = { borderColor: "var(--via-border)" };
  return (
    <div className="space-y-2">
      {conversao.bestChannel && (
        <p className="text-xs" style={{ color: "var(--via-text-body)" }}>
          Melhor conversão: <strong>{channelMeta(conversao.bestChannel).label}</strong>
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={borda}>
            <th className="py-1.5 text-left font-medium">Canal</th>
            <th className="py-1.5 text-right font-medium">Conversas</th>
            <th className="py-1.5 text-right font-medium">Negócios</th>
            <th className="py-1.5 text-right font-medium">Taxa</th>
          </tr>
        </thead>
        <tbody>
          {conversao.byChannel.map((c) => (
            <tr key={c.channel} className="border-b" style={borda}>
              <td className="py-1.5">
                <span className="flex items-center gap-1.5">
                  <ChannelBadge channel={c.channel} />
                  {channelMeta(c.channel).label}
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums">{c.conversations}</td>
              <td className="py-1.5 text-right tabular-nums">{c.deals}</td>
              <td
                className="py-1.5 text-right font-medium tabular-nums"
                style={{ color: c.channel === conversao.bestChannel ? "var(--via-success)" : "var(--via-text-primary)" }}
              >
                {c.rate.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
        Conta negócios do período cujo contato conversou pelo canal. Um contato que falou por dois canais
        aparece nos dois: a leitura é "qual canal participou de negócios", não atribuição exclusiva. O
        destaque exige ao menos 5 conversas, para uma única conversa convertida não virar 100%.
      </p>
    </div>
  );
}
