import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { nomeDaExecucao, useFollowupExecutions } from "@/hooks/useFollowup";
import { formatDateTime } from "@/lib/format";

const STATUS_EXECUCAO: Record<string, { rotulo: string; variante: "default" | "secondary" | "outline" }> = {
  pending: { rotulo: "Em andamento", variante: "default" },
  completed: { rotulo: "Concluída", variante: "secondary" },
  cancelled: { rotulo: "Cancelada", variante: "outline" },
};

/**
 * Histórico de execuções da régua — quem está nela, em que etapa, quando é a
 * próxima tentativa. Morava na rota /followup; a reorganização de 2026-07-31
 * unificou configuração e acompanhamento em Configurações > Automações > Cadências.
 */
export function FollowupExecucoes() {
  const { data: execucoes, isLoading, error, refetch } = useFollowupExecutions();

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) {
    return (
      <ErrorState
        error={error}
        action={<Button variant="outline" size="sm" onClick={() => refetch()}>Tentar de novo</Button>}
      />
    );
  }
  if ((execucoes ?? []).length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Nenhuma conversa na régua ainda"
        description="Quando uma conversa de WhatsApp ficar sem resposta, o follow-up entra em ação e o andamento aparece aqui."
      />
    );
  }

  return (
    <div className="via-card overflow-x-auto" data-testid="followup-execucoes">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contato</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead className="text-right">Tentativas</TableHead>
            <TableHead>Próxima tentativa</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(execucoes ?? []).map((e) => {
            const st = STATUS_EXECUCAO[e.status] ?? { rotulo: e.status, variante: "outline" as const };
            return (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{nomeDaExecucao(e)}</TableCell>
                <TableCell>{e.step_order + 1}ª da régua</TableCell>
                <TableCell className="text-right tabular-nums">{e.attempts}</TableCell>
                <TableCell>
                  {e.status === "pending" && e.next_attempt_at
                    ? formatDateTime(e.next_attempt_at)
                    : "—"}
                </TableCell>
                <TableCell><Badge variant={st.variante}>{st.rotulo}</Badge></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
