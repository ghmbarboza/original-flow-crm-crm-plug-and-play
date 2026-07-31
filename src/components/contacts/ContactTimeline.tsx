import { useState } from "react";
import { toast } from "sonner";
import {
  Activity as ActivityIcon, Clock, Mail, MessageCircle, Pencil, StickyNote, Trash2, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useDeleteActivity, useUpdateActivity } from "@/hooks/useActivities";
import { useContactTimeline, type TimelineItem } from "@/hooks/useContactTimeline";
import { formatDateTime } from "@/lib/format";

const KIND_ICON = {
  activity: ActivityIcon,
  email: Mail,
  whatsapp: MessageCircle,
  deal: TrendingUp,
} as const;

/**
 * Timeline da ficha do contato.
 *
 * Difere da timeline do deal em um ponto: anotações (activities.type = 'note')
 * têm tratamento próprio — destaque visual, autor no título e edição/exclusão
 * inline, permitidas ao autor ou a um admin. O resto das entradas é
 * somente leitura, como no deal.
 */
export function ContactTimeline({ contactId }: { contactId: string }) {
  const { data: timeline, isLoading } = useContactTimeline(contactId);
  const { user, isAdmin } = useAuth();
  const updateActivity = useUpdateActivity();
  const deleteActivity = useDeleteActivity();

  const [editando, setEditando] = useState<TimelineItem | null>(null);
  const [textoEdicao, setTextoEdicao] = useState("");
  const [apagando, setApagando] = useState<TimelineItem | null>(null);

  const podeGerenciar = (item: TimelineItem) =>
    isAdmin || (!!user?.id && item.authorId === user.id);

  const salvarEdicao = async () => {
    if (!editando?.activityId || !textoEdicao.trim()) return;
    try {
      await updateActivity.mutateAsync({
        id: editando.activityId,
        body: textoEdicao.trim(),
        contact_id: contactId,
      });
      setEditando(null);
      toast.success("Anotação atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a anotação.");
    }
  };

  const confirmarExclusao = async () => {
    if (!apagando?.activityId) return;
    try {
      await deleteActivity.mutateAsync({ id: apagando.activityId, contact_id: contactId });
      toast.success("Anotação excluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a anotação.");
    } finally {
      setApagando(null);
    }
  };

  const renderNota = (item: TimelineItem) => (
    <li key={item.id} className="flex gap-3" data-testid="timeline-nota">
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--via-surface)" }}
      >
        <StickyNote className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
      </div>
      {/* Destaque: anotação é conteúdo escrito pelo time, não evento do sistema. */}
      <div
        className="min-w-0 flex-1 rounded-lg border-l-2 p-3"
        style={{ background: "var(--via-surface)", borderColor: "var(--via-accent)" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            {item.title}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <time className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              {formatDateTime(item.at)}
            </time>
            {podeGerenciar(item) && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label="Editar anotação"
                  onClick={() => { setEditando(item); setTextoEdicao(item.body ?? ""); }}
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label="Excluir anotação"
                  onClick={() => setApagando(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </>
            )}
          </div>
        </div>
        {editando?.id === item.id ? (
          <div className="mt-2 space-y-2">
            <Textarea
              aria-label="Texto da anotação"
              value={textoEdicao}
              onChange={(e) => setTextoEdicao(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={salvarEdicao} disabled={updateActivity.isPending || !textoEdicao.trim()}>
                Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--via-text-body)" }}>
            {item.body}
          </p>
        )}
      </div>
    </li>
  );

  const renderEntrada = (item: TimelineItem) => {
    if (item.kind === "activity" && item.activityType === "note") return renderNota(item);
    const Icon = KIND_ICON[item.kind];
    return (
      <li key={item.id} className="flex gap-3">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--via-surface)" }}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              {item.title}
            </p>
            <time className="shrink-0 text-xs" style={{ color: "var(--via-text-muted)" }}>
              {formatDateTime(item.at)}
            </time>
          </div>
          {item.body && (
            <p className="line-clamp-2 text-sm" style={{ color: "var(--via-text-body)" }}>
              {item.body}
            </p>
          )}
          {item.meta && (
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              {item.meta}
            </p>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="via-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
          Histórico
        </h2>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (timeline ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nada registrado ainda. Mensagens, emails, anotações, tarefas, atividades e negócios
          deste contato aparecem aqui em ordem cronológica.
        </p>
      ) : (
        <ul className="space-y-4" data-testid="contact-timeline">
          {(timeline ?? []).map(renderEntrada)}
        </ul>
      )}

      <AlertDialog open={!!apagando} onOpenChange={(open) => !open && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta anotação?</AlertDialogTitle>
            <AlertDialogDescription>
              A anotação sai do histórico do contato permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
