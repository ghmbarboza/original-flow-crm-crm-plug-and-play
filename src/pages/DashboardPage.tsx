import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowRight, Bot, Building2, MessageCircle, TrendingUp, Trophy, UserRound, Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";
import { useAuth } from "@/hooks/useAuth";
import { useReports } from "@/hooks/useReports";
import { VIA } from "@/lib/via-colors";
import { formatCurrency } from "@/lib/format";

/** Cartão de indicador (KPI) com rótulo, valor e ícone. */
function KPI({
  label, value, icon: Icon, accent,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  accent?: string;
}) {
  return (
    <div className="via-card flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{label}</p>
        <p
          className="truncate text-2xl font-semibold tabular-nums"
          style={{ color: "var(--via-text-primary)" }}
        >
          {value}
        </p>
      </div>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "var(--via-surface)", color: accent ?? "var(--via-text-muted)" }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  // h-full + flex-col: no grid, os dois cards da linha ("Negócios por etapa" e
  // "Atendimento") passam a ter a mesma altura, com o conteúdo preenchendo o
  // espaço em vez de cada card parar onde o conteúdo acaba.
  return (
    <div className="via-card flex h-full flex-col p-5">
      <h2 className="mb-3 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>{title}</h2>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

/** Linha de estatística simples (rótulo à esquerda, número à direita). */
function StatRow({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Bot }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
        <Icon className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { profile, role } = useAuth();

  // Visão geral de todo o histórico (o Dashboard é panorâmico; filtros ficam em Relatórios).
  const filters = useMemo(
    () => ({
      from: new Date(0).toISOString(),
      to: new Date(Date.now() + 86_400_000).toISOString(),
      ownerId: null,
    }),
    [],
  );

  const { data, isLoading, error } = useReports(filters);

  const isEmpty =
    !!data &&
    data.leads.total === 0 &&
    data.deals.byStage.length === 0 &&
    data.conversations.total === 0;

  return (
    <AppShell>
      <div className="space-y-6">
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
              <KPI label="Contatos" value={String(data.leads.total)} icon={UserRound} accent={VIA.navy} />
              <KPI label="Negócios abertos" value={String(data.deals.open)} icon={TrendingUp} accent={VIA.blue} />
              <KPI label="Em aberto (forecast)" value={formatCurrency(data.deals.forecast)} icon={Wallet} accent={VIA.blue} />
              <KPI label="Receita ganha" value={formatCurrency(data.deals.wonValue)} icon={Trophy} accent={VIA.success} />
            </div>

            {isEmpty ? (
              <div className="via-card flex flex-col items-center gap-4 p-10 text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: "var(--via-surface)", color: "var(--via-text-muted)" }}
                >
                  <Building2 className="h-7 w-7" strokeWidth={1.5} />
                </span>
                <div className="space-y-1">
                  <h2 className="text-lg font-medium" style={{ color: "var(--via-text-primary)" }}>
                    Ainda não há dados por aqui
                  </h2>
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
                  {role === "admin" && (
                    <Button asChild variant="ghost">
                      <Link to="/settings/demonstration">Carregar dados de exemplo</Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <ChartCard title="Negócios por etapa">
                    {data.deals.byStage.length === 0 ? (
                      <p className="py-12 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
                        Nenhum negócio cadastrado ainda.
                      </p>
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
                  {/* flex-1: as linhas ocupam a altura que o card ganhou do
                      alinhamento e o botão fica no rodapé, alinhado com a base
                      do gráfico ao lado. */}
                  <div className="flex-1 divide-y" style={{ borderColor: "var(--via-border)" }}>
                    <StatRow label="Conversas" value={data.conversations.total} icon={MessageCircle} />
                    <StatRow label="Em aberto" value={data.conversations.open} icon={MessageCircle} />
                    <StatRow label="IA ativa" value={data.conversations.ai} icon={Bot} />
                    <StatRow label="Com humano" value={data.conversations.human} icon={UserRound} />
                  </div>
                  <div className="mt-4">
                    <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                      <Link to="/whatsapp">
                        Abrir atendimento <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                      </Link>
                    </Button>
                  </div>
                </ChartCard>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
