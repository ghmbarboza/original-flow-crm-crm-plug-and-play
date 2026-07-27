import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { channelMeta } from "@/components/whatsapp/ChannelBadge";

// Ordem de exibição dos canais atendíveis.
const CHANNELS = [
  "whatsapp", "instagram", "facebook", "telegram", "twitter", "youtube", "reddit", "bluesky", "threads",
];

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
        <p className="px-1 pb-1 text-xs" style={{ color: "var(--via-text-muted)" }}>
          Sem seleção = atende todos os canais.
        </p>
        <div className="max-h-64 overflow-y-auto">
          {CHANNELS.map((ch) => {
            const { label, Icon } = channelMeta(ch);
            return (
              <label
                key={ch}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-[var(--via-surface)]"
              >
                <Checkbox checked={selected.includes(ch)} onCheckedChange={() => toggle(ch)} />
                <Icon className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                {label}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
