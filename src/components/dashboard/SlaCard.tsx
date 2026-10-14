import { channelMeta, ChannelBadge } from "@/components/whatsapp/ChannelBadge";
import { ChartCard, KPI, SemDados } from "@/components/dashboard/PainelCards";
import { formatWaitingTime } from "@/lib/sla";
import { formatDateTime } from "@/lib/format";
import type { useSlaReport } from "@/hooks/useSlaReport";

type Sla = NonNullable<ReturnType<typeof useSlaReport>["data"]>;

const borda = { borderColor: "var(--via-border)" };

/** Tempo de primeira resposta: média, por agente, por canal e violações (Parte 8 do Sprint 10A). */
export function SlaCard({ sla, nomes }: { sla: Sla; nomes: Map<string, string> }) {
  return (
    <ChartCard title="SLA de atendimento">
      {sla.totalConsidered === 0 ? (
        <SemDados>Sem conversas no período.</SemDados>
      ) : (
        <div className="space-y-4" data-testid="sla-report">
          <div className="grid gap-3 sm:grid-cols-3">
            <KPI
              label="Tempo médio de 1ª resposta"
              value={sla.avgFirstResponseMinutes !== null ? formatWaitingTime(sla.avgFirstResponseMinutes) : "-"}
            />
            <KPI label="Dentro do SLA" value={sla.withinRate !== null ? `${sla.withinRate}%` : "-"} />
            <KPI label="Violações" value={String(sla.breaches.length)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>1ª resposta por agente</h3>
              {sla.byAgent.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                  Nenhuma conversa atribuída respondida no período.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={borda}>
                      <th className="py-1.5 text-left font-medium">Agente</th>
                      <th className="py-1.5 text-right font-medium">Conversas</th>
                      <th className="py-1.5 text-right font-medium">Tempo médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sla.byAgent.map((row) => (
                      <tr key={row.key} className="border-b" style={borda}>
                        <td className="py-1.5">{nomes.get(row.key) ?? "-"}</td>
                        <td className="py-1.5 text-right tabular-nums">{row.count}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatWaitingTime(row.avgMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>1ª resposta por canal</h3>
              {sla.byChannel.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhuma conversa respondida no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={borda}>
                      <th className="py-1.5 text-left font-medium">Canal</th>
                      <th className="py-1.5 text-right font-medium">Conversas</th>
                      <th className="py-1.5 text-right font-medium">Tempo médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sla.byChannel.map((row) => (
                      <tr key={row.key} className="border-b" style={borda}>
                        <td className="py-1.5">
                          <span className="flex items-center gap-1.5">
                            <ChannelBadge channel={row.key} />
                            {channelMeta(row.key).label}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{row.count}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatWaitingTime(row.avgMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {sla.breaches.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Conversas que violaram o SLA</h3>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={borda}>
                      <th className="py-1.5 text-left font-medium">Conversa</th>
                      <th className="py-1.5 text-left font-medium">Canal</th>
                      <th className="py-1.5 text-left font-medium">Agente</th>
                      <th className="py-1.5 text-right font-medium">1ª resposta</th>
                      <th className="py-1.5 text-right font-medium">Início</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sla.breaches.map((b) => (
                      <tr key={b.id} className="border-b" style={borda}>
                        <td className="py-1.5">{b.name}</td>
                        <td className="py-1.5">{channelMeta(b.channel ?? "whatsapp").label}</td>
                        <td className="py-1.5">{b.assigned_to ? nomes.get(b.assigned_to) ?? "-" : "-"}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {b.first_response_minutes !== null ? formatWaitingTime(b.first_response_minutes) : "sem resposta"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{formatDateTime(b.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}
