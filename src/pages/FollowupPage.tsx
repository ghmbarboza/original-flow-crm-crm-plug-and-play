import { Link } from "react-router-dom";
import { ArrowRight, Clock, Settings2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  nomeDaExecucao, useFollowupConfig, useFollowupExecutions, useFollowupSteps,
} from "@/hooks/useFollowup";
import { formatDateTime } from "@/lib/format";

/**
 * Tela de USO do follow-up: o que a régua está fazendo com cada conversa.
 *
 * Não substitui Configurações > Follow-up — mensagens, prazos e limite
 * continuam lá. Aqui é acompanhamento: quem está na régua, em que etapa,
 * quando é a próxima tentativa. Existe porque o follow-up morava só dentro de
 * Configurações e o dia a dia dele ficava invisível na navegação.
 */

const STATUS_EXECUCAO: Record<string, { rotulo: string; variante: "default" | "secondary" | "outline" }> = {
  pending: { rotulo: "Em andamento", variante: "default" },
  completed: { rotulo: "Concluída", variante: "secondary" },
  cancelled: { rotulo: "Cancelada", variante: "outline" },
};

export default function FollowupPage() {
  const { data: config, isLoading: loadingConfig } = useFollowupConfig();
  const { data: steps } = useFollowupSteps();
  const { data: execucoes, isLoading, error, refetch } = useFollowupExecutions();

  const ativo = config?.is_active ?? false;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Clock className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Follow-up
            </h1>
          </div>
          <Button asChild variant="outline" className="gap-1.5">
            <Link to="/settings/follow-up" data-testid="followup-configurar">
              <Settings2 className="h-4 w-4" strokeWidth={1.5} />
              Configurar régua
            </Link>
          </Button>
        </div>

        {/* Resumo da régua: estado, tentativas e etapas — leitura, não edição. */}
        {loadingConfig ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="via-card flex flex-wrap items-center gap-x-6 gap-y-2 p-4" data-testid="followup-resumo">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: ativo ? "var(--via-success)" : "var(--via-text-muted)" }}
              />
              <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                {ativo ? "Régua ativa" : "Régua desativada"}
              </span>
            </div>
            <span className="text-sm" style={{ color: "var(--via-text-body)" }}>
              {(steps ?? []).length} etapa(s) · até {config?.max_attempts ?? (steps ?? []).length} tentativa(s) por conversa
            </span>
            {!ativo && (
              <span className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                Nenhuma mensagem é enviada enquanto a régua estiver desativada.
              </span>
            )}
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <ErrorState
            error={error}
            action={<Button variant="outline" size="sm" onClick={() => refetch()}>Tentar de novo</Button>}
          />
        ) : (execucoes ?? []).length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Nenhuma conversa na régua ainda"
            description="Quando uma conversa de WhatsApp ficar sem resposta, o follow-up entra em ação e o andamento aparece aqui."
            action={
              !ativo ? (
                <Button asChild variant="outline" className="gap-1.5">
                  <Link to="/settings/follow-up">
                    Ativar em Configurações
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="via-card overflow-x-auto">
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
        )}
      </div>
    </AppShell>
  );
}
