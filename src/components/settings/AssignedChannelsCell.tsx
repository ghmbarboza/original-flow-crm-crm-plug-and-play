import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { channelMeta } from "@/components/whatsapp/ChannelBadge";
import { Skeleton } from "@/components/ui/skeleton";
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
  channels: string[];
  onSave: (channels: string[]) => void;
  disabled?: boolean;
}

/**
 * Editor dos canais que um agente atende (assigned_channels).
 * Seleção vazia = sem restrição (atende todos os canais). Salva ao fechar.
 */
export function AssignedChannelsCell({ channels, onSave, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(channels);
  const { channels: ativos, isLoading } = useActiveChannels();

  // Canais salvos que não estão mais conectados continuam visíveis (com aviso)
  // para não apagar silenciosamente a configuração do agente.
  const inativosSalvos = selected.filter((c) => !ativos.includes(c));
  const lista = [...ativos, ...inativosSalvos].sort(porOrdem);

  // Ressincroniza se o valor externo mudar (ex.: após refetch).
  const external = channels.join(",");
  const [snapshot, setSnapshot] = useState(external);
  if (external !== snapshot && !open) {
    setSnapshot(external);
    setSelected(channels);
  }

  const toggle = (ch: string) => {
    setSelected((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && selected.join(",") !== channels.join(",")) onSave(selected);
  };

  const summary =
    selected.length === 0 ? "Todos os canais"
    : selected.length === 1 ? channelMeta(selected[0]).label
    : `${selected.length} canais`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 justify-between gap-1.5 font-normal" disabled={disabled}>
          {summary}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" strokeWidth={1.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {isLoading ? (
          <div className="space-y-1.5 p-1">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : lista.length === 0 ? (
          <p className="p-1 text-xs" style={{ color: "var(--via-text-muted)" }}>
            Nenhum canal conectado ainda —{" "}
            <Link to="/settings/integrations" className="text-primary hover:underline">
              conecte em Configurações &gt; Integrações
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="px-1 pb-1 text-xs" style={{ color: "var(--via-text-muted)" }}>
              Sem seleção = atende todos os canais.
            </p>
            <div className="max-h-64 overflow-y-auto">
              {lista.map((ch) => {
                const { label, Icon } = channelMeta(ch);
                const inativo = !ativos.includes(ch);
                return (
                  <label
                    key={ch}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-[var(--via-surface)]"
                  >
                    <Checkbox checked={selected.includes(ch)} onCheckedChange={() => toggle(ch)} />
                    <Icon className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                    {label}
                    {inativo && (
                      <span
                        className="ml-auto flex items-center gap-1 text-[11px]"
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
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
