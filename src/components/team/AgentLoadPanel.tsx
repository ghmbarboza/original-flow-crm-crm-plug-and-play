import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Radio, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChannelBadge, channelMeta } from "@/components/whatsapp/ChannelBadge";
import {
  useAgentConversations, useAgentLoad, useAgentLoadRealtime, useReassignConversation,
} from "@/hooks/useAgentLoad";
import { formatDateTime } from "@/lib/format";

const QUEUE = "__queue__";

/** Detalhe de um agente: conversas ativas e reatribuição. */
function AgentDetailDialog({
  agentId, agentName, agents, onClose,
}: {
  agentId: string | null;
  agentName: string;
  agents: { agentId: string; agentName: string }[];
  onClose: () => void;
}) {
  const { data: conversations, isLoading } = useAgentConversations(agentId);
  const reassign = useReassignConversation();

  const handleReassign = async (conversationId: string, target: string) => {
    try {
      await reassign.mutateAsync({
        conversationId,
        agentId: target === QUEUE ? null : target,
      });
      toast.success(target === QUEUE ? "Conversa devolvida à fila." : "Conversa reatribuída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reatribuir.");
    }
  };

  return (
    <Dialog open={!!agentId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conversas de {agentName}</DialogTitle>
          <DialogDescription>
            Reatribua para outro agente ou devolva à fila geral.
          </DialogDescription>
        </DialogHeader>

        <div className="via-scroll max-h-[60vh]">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (conversations ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
              Nenhuma conversa ativa com este agente.
            </p>
          ) : (
            <ul className="space-y-2">
              {(conversations ?? []).map((c) => {
                const contact = c.contact as { first_name?: string; last_name?: string } | null;
                const name = [contact?.first_name, contact?.last_name]
                  .filter(Boolean).join(" ").trim() || c.phone_number;
                return (
                  <li key={c.id} className="via-card flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ChannelBadge channel={c.channel} />
                        <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                          {name}
                        </p>
                        {c.unread_count > 0 && (
                          <span
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium"
                            style={{ background: "var(--via-success)", color: "var(--via-white)" }}
                          >
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs" style={{ color: "var(--via-text-muted)" }}>
                        {c.last_message_preview ?? "—"} · {formatDateTime(c.last_message_at)}
                      </p>
                    </div>
                    <Select onValueChange={(v) => handleReassign(c.id, v)}>
                      <SelectTrigger className="w-44 shrink-0">
                        <SelectValue placeholder="Reatribuir…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={QUEUE}>Devolver à fila</SelectItem>
                        {agents
                          .filter((a) => a.agentId !== agentId)
                          .map((a) => (
                            <SelectItem key={a.agentId} value={a.agentId}>{a.agentName}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Painel de supervisão: quantas conversas cada agente atende, por canal.
 *
 * Atualiza sozinho — useAgentLoadRealtime assina `conversations` e reconsulta a
 * agregação a cada mudança (Realtime não publica VIEW, só tabela).
 */
export function AgentLoadPanel() {
  const { data, isLoading, error } = useAgentLoad();
  useAgentLoadRealtime();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (error) {
    return (
      <div className="via-card p-8 text-center">
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Não foi possível carregar o painel
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-muted)" }}>
          {error instanceof Error ? error.message : "Erro desconhecido."}
        </p>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const channels = data?.channels ?? [];

  if (rows.length === 0) {
    return (
      <div className="via-card p-10 text-center">
        <Users2 className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Nenhum agente ativo
        </p>
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Aprove membros em Configurações &gt; Equipe para acompanhar a carga de atendimento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          Conversas ativas por agente. Clique num agente para ver e reatribuir.
        </p>
        <span
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--via-text-muted)" }}
        >
          <Radio className="h-3.5 w-3.5" strokeWidth={1.5} />
          Ao vivo
        </span>
      </div>

      <div className="via-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agente</TableHead>
              {channels.map((ch) => (
                <TableHead key={ch} className="text-right">{channelMeta(ch).label}</TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Não lidas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.agentId}
                className="cursor-pointer"
                onClick={() => setSelected({ id: row.agentId, name: row.agentName })}
              >
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {row.agentName}
                    {row.atCapacity.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: "var(--via-danger-bg, #fee2e2)", color: "var(--via-danger-text, #991b1b)" }}
                        title={`Lotado em: ${row.atCapacity.map((c) => channelMeta(c).label).join(", ")}`}
                      >
                        <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                        Lotado
                      </span>
                    )}
                  </span>
                </TableCell>
                {channels.map((ch) => (
                  <TableCell key={ch} className="text-right tabular-nums">
                    {row.byChannel[ch] ?? 0}
                  </TableCell>
                ))}
                <TableCell className="text-right font-medium tabular-nums">{row.total}</TableCell>
                <TableCell className="text-right tabular-nums">{row.unread}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AgentDetailDialog
        agentId={selected?.id ?? null}
        agentName={selected?.name ?? ""}
        agents={rows.map((r) => ({ agentId: r.agentId, agentName: r.agentName }))}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
