import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { channelMeta } from "@/components/whatsapp/ChannelBadge";
import { useActiveChannels } from "@/hooks/useActiveChannels";

// Ordem preferida de exibição — canais fora dela vão para o fim.
const ORDEM = [
  "whatsapp", "instagram", "facebook", "telegram", "twitter", "youtube", "reddit", "bluesky", "threads",
];
const porOrdem = (a: string, b: string) => {
  const ia = ORDEM.indexOf(a), ib = ORDEM.indexOf(b);
  return (ia === -1 ? ORDEM.length : ia) - (ib === -1 ? ORDEM.length : ib);
};

interface Props {
  legend: string;
  /** Universo válido de valores aceito pelo backend. */
  allowed: readonly string[];
  selected: string[];
  onToggle: (channel: string, checked: boolean) => void;
  /** Prefixo dos data-testid dos checkboxes (ex.: "sla"). */
  testIdPrefix: string;
}

/**
 * Seleção de canais restrita aos canais realmente conectados da organização.
 * Canais já salvos mas desconectados permanecem visíveis com aviso discreto,
 * para não apagar configuração silenciosamente.
 */
export function ConnectedChannelsFieldset({ legend, allowed, selected, onToggle, testIdPrefix }: Props) {
  const { channels: ativos, isLoading } = useActiveChannels();

  const conectadosValidos = ativos.filter((c) => allowed.includes(c));
  const inativosSalvos = selected.filter((c) => !conectadosValidos.includes(c));
  const lista = [...conectadosValidos, ...inativosSalvos].sort(porOrdem);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
        {legend}
      </legend>
      {isLoading ? (
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
        </div>
      ) : lista.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nenhum canal conectado —{" "}
          <Link to="/settings/integrations" className="text-primary hover:underline">
            conecte em Configurações &gt; Integrações
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {lista.map((channel) => {
            const inativo = !conectadosValidos.includes(channel);
            return (
              <label
                key={channel}
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--via-text-body)" }}
              >
                <Checkbox
                  checked={selected.includes(channel)}
                  onCheckedChange={(v) => onToggle(channel, v === true)}
                  data-testid={`${testIdPrefix}-channel-${channel}`}
                />
                {channelMeta(channel).label}
                {inativo && (
                  <span
                    className="flex items-center gap-1 text-[11px]"
                    style={{ color: "var(--via-text-muted)" }}
                    title="Canal salvo, mas não está conectado agora"
                  >
                    <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                    inativo
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
