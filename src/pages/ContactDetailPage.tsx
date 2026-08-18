import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Award, Building2, CalendarClock, Pencil, Plus, StickyNote, TrendingUp, UserRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ContactStatusBadge } from "@/components/contacts/ContactStatusBadge";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { ContactTimeline } from "@/components/contacts/ContactTimeline";
import { ScheduleMessageDialog } from "@/components/contacts/ScheduleMessageDialog";
import { ScheduledMessagesCard } from "@/components/contacts/ScheduledMessagesCard";
import { ActivityFormDialog } from "@/components/activities/ActivityFormDialog";
import { DealFormDialog } from "@/components/deals/DealFormDialog";
import { useContact } from "@/hooks/useContacts";
import { useCreateActivity } from "@/hooks/useActivities";

/**
 * Ficha do contato (/contacts/:id): cabeçalho com os dados-chave e o histórico
 * cronológico completo — tudo que aconteceu com o lead num lugar só.
 *
 * Anotações são activities.type = 'note': nenhum schema novo, e elas já entram
 * na timeline do deal e nos filtros de /activities de graça.
 */
export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: contato, isLoading, error, refetch } = useContact(id ?? null);
  const criarAtividade = useCreateActivity();

  const [editOpen, setEditOpen] = useState(false);
  const [notaAberta, setNotaAberta] = useState(false);
  const [textoNota, setTextoNota] = useState("");
  const [atividadeOpen, setAtividadeOpen] = useState(false);
  const [negocioOpen, setNegocioOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);

  const salvarNota = async () => {
    if (!id || !textoNota.trim()) return;
    try {
      await criarAtividade.mutateAsync({
        type: "note",
        title: "Anotação",
        body: textoNota.trim(),
        contact_id: id,
      });
      setTextoNota("");
      setNotaAberta(false);
      toast.success("Anotação salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a anotação.");
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (error || !contato) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/contacts"><ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Contatos</Link>
          </Button>
          {error ? (
            <ErrorState
              error={error}
              action={<Button variant="outline" size="sm" onClick={() => refetch()}>Tentar de novo</Button>}
            />
          ) : (
            <p className="py-8 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
              Contato não encontrado — pode ter sido removido ou mesclado em outro.
            </p>
          )}
        </div>
      </AppShell>
    );
  }

  const nome = [contato.first_name, contato.last_name].filter(Boolean).join(" ");

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 gap-1.5">
            <Link to="/contacts"><ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Contatos</Link>
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <UserRound className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
              <h1
                className="font-display text-3xl font-medium tracking-tight"
                style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
                data-testid="contact-detail-nome"
              >
                {nome}
              </h1>
            </div>
            <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
              Editar
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <ContactStatusBadge status={contato.status} />
            <span className="inline-flex items-center gap-1" style={{ color: "var(--via-text-body)" }}>
              <Award className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Score: {contato.lead_score}
            </span>
            <span className="inline-flex items-center gap-1" style={{ color: "var(--via-text-body)" }}>
              <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              {contato.company ? (
                contato.company.name
              ) : (
                // Lead sem empresa é estado legítimo: diz isso em texto e oferece
                // o vínculo, em vez de esconder o campo ou inventar registro.
                <>
                  Sem empresa vinculada
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    style={{ color: "var(--via-accent)" }}
                    onClick={() => setEditOpen(true)}
                  >
                    Vincular empresa
                  </button>
                </>
              )}
            </span>
            {contato.email && <span style={{ color: "var(--via-text-muted)" }}>{contato.email}</span>}
            {contato.phone && <span style={{ color: "var(--via-text-muted)" }}>{contato.phone}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setNotaAberta((v) => !v)} data-testid="contact-nova-anotacao">
            <StickyNote className="h-4 w-4" strokeWidth={1.5} />
            Anotação
          </Button>
          {/* Um botão só: "Atividade" e "Tarefa" abriam o MESMO formulário, e o
              seletor de tipo já vem em "Tarefa". A diferença era só o seletor
              travado — dois caminhos para a mesma tela, e nenhuma pista de qual
              escolher. Tarefa segue a um clique: é o tipo padrão do diálogo. */}
          <Button variant="outline" className="gap-1.5" onClick={() => setAtividadeOpen(true)} data-testid="contact-nova-atividade">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Atividade
          </Button>
          {/* Criar negócio a partir do contato: o caminho antigo era decorar o
              nome, ir em Negócios e procurá-lo no seletor. */}
          <Button variant="outline" className="gap-1.5" onClick={() => setNegocioOpen(true)} data-testid="contact-novo-negocio">
            <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
            Negócio
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setAgendarOpen(true)} data-testid="contact-agendar-mensagem">
            <CalendarClock className="h-4 w-4" strokeWidth={1.5} />
            Agendar mensagem
          </Button>
        </div>

        {notaAberta && (
          <div className="via-card space-y-2 p-4">
            <Textarea
              aria-label="Nova anotação"
              placeholder="Escreva a anotação — visível para todos que acessam este contato."
              value={textoNota}
              onChange={(e) => setTextoNota(e.target.value)}
              rows={3}
              autoFocus
              data-testid="contact-anotacao-texto"
            />
            <div className="flex gap-2">
              <Button
                onClick={salvarNota}
                disabled={criarAtividade.isPending || !textoNota.trim()}
                data-testid="contact-anotacao-salvar"
              >
                Salvar anotação
              </Button>
              <Button variant="outline" onClick={() => { setNotaAberta(false); setTextoNota(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <ScheduledMessagesCard contactId={contato.id} />
        <ContactTimeline contactId={contato.id} />
      </div>

      <ContactFormDialog open={editOpen} onOpenChange={setEditOpen} contact={contato} />
      <DealFormDialog
        open={negocioOpen}
        onOpenChange={setNegocioOpen}
        defaultContactId={contato.id}
        defaultTitle={[contato.first_name, contato.last_name].filter(Boolean).join(" ")}
      />
      <ActivityFormDialog
        open={atividadeOpen}
        onOpenChange={setAtividadeOpen}
        presets={{ contactId: contato.id }}
        hideLinks
      />
      {/* A auditoria de 2026-07-31 pegou o botão sem efeito: o estado ligava,
          mas o dialog nunca era montado. */}
      <ScheduleMessageDialog
        open={agendarOpen}
        onOpenChange={setAgendarOpen}
        contactId={contato.id}
      />
    </AppShell>
  );
}
