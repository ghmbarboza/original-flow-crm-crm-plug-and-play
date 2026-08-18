import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Mail, Plug, Plus, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ComposeEmailDialog } from "@/components/email/ComposeEmailDialog";
import {
  useConnectGmail, useDisconnectGmail, useEmailConnection, useSyncGmail,
} from "@/hooks/useEmailConnection";
import { useEmailThreads, useThreadEmails, type EmailThread } from "@/hooks/useEmails";
import { formatDateTime } from "@/lib/format";

function threadName(thread: EmailThread): string {
  if (thread.contact) {
    const name = [thread.contact.first_name, thread.contact.last_name].filter(Boolean).join(" ").trim();
    if (name) return name;
  }
  return thread.latest.from_email ?? "(sem remetente)";
}

function ThreadView({ threadId }: { threadId: string }) {
  const { data: emails, isLoading } = useThreadEmails(threadId);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-4 p-4">
      {(emails ?? []).map((email) => (
        <div key={email.id} className="via-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              {email.subject ?? "(sem assunto)"}
            </p>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: "var(--via-surface)", color: "var(--via-text-muted)" }}
            >
              {email.direction === "inbound" ? "Recebido" : "Enviado"}
            </span>
          </div>
          <p className="mb-2 text-xs" style={{ color: "var(--via-text-muted)" }}>
            {email.from_email} · {formatDateTime(email.sent_at ?? email.created_at)}
          </p>
          <div
            className="prose-sm max-w-none text-sm"
            style={{ color: "var(--via-text-body)" }}
            dangerouslySetInnerHTML={{ __html: email.body_html ?? "" }}
          />
        </div>
      ))}
    </div>
  );
}

export default function InboxPage() {
  const { data: connection, isLoading: loadingConn } = useEmailConnection();
  const connectGmail = useConnectGmail();
  const disconnect = useDisconnectGmail();
  const syncGmail = useSyncGmail();
  const { data: threads, isLoading } = useEmailThreads();

  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const handleConnect = async () => {
    try {
      await connectGmail.mutateAsync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível conectar o Gmail.");
    }
  };

  const handleSync = async () => {
    try {
      const { synced } = await syncGmail.mutateAsync();
      toast.success(`${synced} email(s) sincronizado(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar.");
    }
  };

  if (loadingConn) {
    return <AppShell><PageSkeleton /></AppShell>;
  }

  // Sem conexão: card de conectar Gmail.
  if (!connection) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Mail className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
              Email
            </h1>
          </div>
          {/* EmptyState em vez de card estreito (max-w-xl mx-auto): mesmo
              componente e largura dos estados vazios do resto da plataforma. */}
          <EmptyState
            icon={Plug}
            title="Conecte seu Gmail"
            description="Sincronize suas conversas de email e envie mensagens direto do CRM, com histórico por contato."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={handleConnect} disabled={connectGmail.isPending} className="gap-1.5">
                  <Plug className="h-4 w-4" strokeWidth={1.5} />
                  {connectGmail.isPending ? "Redirecionando…" : "Conectar Gmail"}
                </Button>
                {/* Saída para quem ainda não cadastrou as credenciais do Google:
                    sem ela, o botão acima só respondia com erro e não havia
                    para onde ir. */}
                <Button variant="outline" asChild className="gap-1.5">
                  <Link to="/settings/integrations?integration=gmail">
                    Configurar credenciais
                    <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                  </Link>
                </Button>
              </div>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mail className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <div>
              <h1 className="font-display text-3xl font-medium tracking-tight" style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}>
                Email
              </h1>
              <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                {connection.email}
                <button className="ml-2 underline" onClick={() => disconnect.mutate(connection.id)}>desconectar</button>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSync} disabled={syncGmail.isPending} className="gap-1.5">
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
              {syncGmail.isPending ? "Sincronizando…" : "Sincronizar"}
            </Button>
            <Button onClick={() => setComposeOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Novo email
            </Button>
          </div>
        </div>

        <div className="via-card grid overflow-hidden md:grid-cols-[minmax(280px,360px)_1fr]" style={{ height: "calc(100vh - 10rem)" }}>
          <div className="overflow-y-auto border-r" style={{ borderColor: "var(--via-border)" }}>
            {isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (threads ?? []).length === 0 ? (
              <div className="p-8 text-center">
                <Mail className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                  Nenhum email ainda. Sincronize ou envie o primeiro.
                </p>
              </div>
            ) : (
              <ul>
                {(threads ?? []).map((thread) => (
                  <li key={thread.threadId}>
                    <button
                      type="button"
                      onClick={() => setSelectedThread(thread.threadId)}
                      className="w-full border-b p-3 text-left"
                      style={{
                        borderColor: "var(--via-border)",
                        background: selectedThread === thread.threadId ? "var(--via-surface)" : "transparent",
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                          {threadName(thread)}
                        </p>
                        <time className="shrink-0 text-xs" style={{ color: "var(--via-text-muted)" }}>
                          {formatDateTime(thread.latest.created_at)}
                        </time>
                      </div>
                      <p className="truncate text-sm" style={{ color: "var(--via-text-body)" }}>
                        {thread.latest.subject ?? "(sem assunto)"}
                      </p>
                      {thread.count > 1 && (
                        <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>{thread.count} mensagens</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-y-auto">
            {selectedThread ? (
              <ThreadView threadId={selectedThread} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Mail className="mb-3 h-8 w-8" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>Selecione uma conversa para ler.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ComposeEmailDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </AppShell>
  );
}
