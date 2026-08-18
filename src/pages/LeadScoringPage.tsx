import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Award, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ALL_CHANNELS, SCORING_EVENTS, useDeleteScoringRule, useSaveScoringRule,
  useScoreHistory, useScoringRules,
} from "@/hooks/useLeadScoring";
import { useContacts } from "@/hooks/useContacts";
import { ChannelBadge, channelMeta } from "@/components/whatsapp/ChannelBadge";
import { useActiveChannels } from "@/hooks/useActiveChannels";
import { formatDateTime } from "@/lib/format";

function eventLabel(type: string) {
  return SCORING_EVENTS.find((e) => e.value === type)?.label ?? type;
}

function RulesTab() {
  /**
   * Só os canais realmente conectados aparecem no filtro.
   *
   * A lista fixa oferecia Instagram, Telegram e Facebook para uma organização
   * que só tem WhatsApp: filtro que não pode dar resultado nenhum, e nada
   * dizendo por quê. `useActiveChannels` é a fonte única disso — quando um canal
   * novo é conectado, ele passa a aparecer aqui sozinho.
   */
  const { channels: canaisConectados } = useActiveChannels();
  const { data: rules, isLoading } = useScoringRules();
  const saveRule = useSaveScoringRule();
  const deleteRule = useDeleteScoringRule();
  const [draft, setDraft] = useState({
    label: "",
    event_type: SCORING_EVENTS[0].value as string,
    points: "10",
    channel: ALL_CHANNELS,
  });

  const add = async () => {
    if (!draft.label.trim()) {
      toast.error("Informe um rótulo para a regra.");
      return;
    }
    try {
      await saveRule.mutateAsync({
        label: draft.label.trim(),
        event_type: draft.event_type,
        points: Number(draft.points) || 0,
        channel: draft.channel === ALL_CHANNELS ? null : draft.channel,
      });
      toast.success("Regra criada.");
      setDraft({
        label: "", event_type: SCORING_EVENTS[0].value, points: "10", channel: ALL_CHANNELS,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a regra.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="via-card flex flex-wrap items-end gap-2 p-3">
        {/* Os rótulos eram <label> soltos, sem htmlFor. Visualmente pareciam
            corretos, mas nenhum campo tinha nome acessível: "Pontos" (sem
            placeholder para servir de muleta) era anunciado como campo anônimo. Os
            Select do Radix são <button>, que <label for> não nomeia — daí o
            aria-labelledby em vez de htmlFor nos dois. */}
        <div className="min-w-40 flex-1 space-y-1">
          <label htmlFor="regra-rotulo" className="text-xs block" style={{ color: "var(--via-text-muted)" }}>Rótulo</label>
          <Input id="regra-rotulo" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Ex.: Engajou com email" />
        </div>
        <div className="min-w-44 space-y-1">
          <label id="regra-evento-label" className="text-xs block" style={{ color: "var(--via-text-muted)" }}>Evento</label>
          <Select value={draft.event_type} onValueChange={(v) => setDraft({ ...draft, event_type: v })}>
            <SelectTrigger aria-labelledby="regra-evento-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCORING_EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44 space-y-1">
          <label id="regra-canal-label" className="text-xs block" style={{ color: "var(--via-text-muted)" }}>Canal</label>
          <Select value={draft.channel} onValueChange={(v) => setDraft({ ...draft, channel: v })}>
            <SelectTrigger aria-labelledby="regra-canal-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CHANNELS}>Todos os canais</SelectItem>
              {canaisConectados.map((ch) => (
                <SelectItem key={ch} value={ch}>{channelMeta(ch).label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24 space-y-1">
          <label htmlFor="regra-pontos" className="text-xs block" style={{ color: "var(--via-text-muted)" }}>Pontos</label>
          <Input id="regra-pontos" type="number" value={draft.points} onChange={(e) => setDraft({ ...draft, points: e.target.value })} />
        </div>
        <Button onClick={add} disabled={saveRule.isPending} className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Adicionar
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (rules ?? []).length === 0 ? (
        <div className="via-card p-8 text-center">
          <Award className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Nenhuma regra ainda. Crie regras para pontuar contatos conforme o engajamento.
          </p>
        </div>
      ) : (
        <div className="via-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rótulo</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead className="text-right">Pontos</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules ?? []).map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.label}</TableCell>
                  <TableCell>{eventLabel(rule.event_type)}</TableCell>
                  <TableCell>
                    {rule.channel ? (
                      <ChannelBadge channel={rule.channel} showLabel />
                    ) : (
                      <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                        Todos os canais
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rule.points > 0 ? `+${rule.points}` : rule.points}</TableCell>
                  <TableCell>
                    {/* Uma coluna "Ativa" só nomeia o switch para quem enxerga a
                        tabela. O leitor de tela lê linha a linha, então o nome
                        precisa dizer de qual regra este switch é. */}
                    <Switch
                      aria-label={`Ativar a regra "${rule.label}"`}
                      checked={rule.is_active}
                      onCheckedChange={(v) => saveRule.mutate({ id: rule.id, label: rule.label, event_type: rule.event_type, points: rule.points, is_active: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => deleteRule.mutate(rule.id)} aria-label="Excluir regra">
                      <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const { data: contacts } = useContacts();
  const [contactId, setContactId] = useState<string | null>(null);
  const { data: history, isLoading } = useScoreHistory(contactId);

  const options = useMemo(
    () => (contacts ?? []).map((c) => ({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "(sem nome)",
      score: c.lead_score,
    })),
    [contacts],
  );

  return (
    <div className="space-y-4">
      <div className="max-w-md space-y-1">
        <label id="historico-contato-label" className="text-xs block" style={{ color: "var(--via-text-muted)" }}>Contato</label>
        <Select value={contactId ?? ""} onValueChange={setContactId}>
          <SelectTrigger aria-labelledby="historico-contato-label"><SelectValue placeholder="Escolha um contato" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name} · {o.score} pts</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!contactId ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
          Selecione um contato para ver o histórico de pontuação.
        </p>
      ) : isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (history ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nenhuma pontuação registrada para este contato ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {(history ?? []).map((entry) => (
            <li key={entry.id} className="via-card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{entry.reason}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{formatDateTime(entry.created_at)}</p>
                  {entry.channel && <ChannelBadge channel={entry.channel} showLabel />}
                </div>
              </div>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: entry.points >= 0 ? "var(--via-success)" : "var(--via-coral)" }}
              >
                {entry.points >= 0 ? `+${entry.points}` : entry.points}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LeadScoringPage() {

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Award className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
            Lead Scoring
          </h1>
        </div>

        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">Regras</TabsTrigger>
            <TabsTrigger value="history">Histórico por contato</TabsTrigger>
          </TabsList>
          <TabsContent value="rules" className="pt-4"><RulesTab /></TabsContent>
          <TabsContent value="history" className="pt-4"><HistoryTab /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
