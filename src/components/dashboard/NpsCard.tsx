import { ChannelBadge, channelMeta } from "@/components/whatsapp/ChannelBadge";
import { ChartCard, KPI } from "@/components/dashboard/PainelCards";
import type { useNpsReport } from "@/hooks/useNps";

type Nps = NonNullable<ReturnType<typeof useNpsReport>["data"]>;

/** NPS do período: indicadores, quebra por agente e por canal e comentários (Parte 5 do Sprint 10B). */
export function NpsCard({ nps, nomes }: { nps: Nps; nomes: Map<string, string> }) {
  return (
    <ChartCard title="NPS: satisfação do atendimento">
      <div className="space-y-4" data-testid="nps-report">
        <div className="grid gap-3 sm:grid-cols-4">
          <KPI label="NPS" value={nps.nps !== null ? String(nps.nps) : "-"} />
          <KPI label="Respostas" value={`${nps.responses}/${nps.surveysSent}`} />
          <KPI label="Promotores (9-10)" value={String(nps.promoters)} />
          <KPI label="Detratores (0-6)" value={String(nps.detractors)} />
        </div>

        {nps.responses > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {nps.byAgent.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>NPS por agente</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {nps.byAgent.map((row) => (
                      <tr key={row.key} className="border-b" style={{ borderColor: "var(--via-border)" }}>
                        <td className="py-1.5">{nomes.get(row.key) ?? "-"}</td>
                        <td className="py-1.5 text-right tabular-nums">{row.count} resp.</td>
                        <td className="py-1.5 text-right font-medium tabular-nums">{row.nps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {nps.byChannel.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>NPS por canal</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {nps.byChannel.map((row) => (
                      <tr key={row.key} className="border-b" style={{ borderColor: "var(--via-border)" }}>
                        <td className="py-1.5">
                          <span className="flex items-center gap-1.5">
                            <ChannelBadge channel={row.key} />
                            {channelMeta(row.key).label}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{row.count} resp.</td>
                        <td className="py-1.5 text-right font-medium tabular-nums">{row.nps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {nps.comments.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Comentários recentes</h3>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {nps.comments.map((c, i) => (
                <li key={i} className="text-sm" style={{ color: "var(--via-text-body)" }}>
                  <span className="font-medium tabular-nums">[{c.score}]</span> {c.comment}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ChartCard>
  );
}
