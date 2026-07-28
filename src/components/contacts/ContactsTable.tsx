import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ContactStatusBadge } from "@/components/contacts/ContactStatusBadge";
import { useDeleteContact, type Contact } from "@/hooks/useContacts";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface Props {
  contacts: Contact[];
  isLoading: boolean;
  /** True quando há busca/filtro ativo: muda o texto do estado vazio. */
  isFiltered: boolean;
  onSelect: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onCreate: () => void;
}

export function ContactsTable({ contacts, isLoading, isFiltered, onSelect, onEdit, onCreate }: Props) {
  const deleteContact = useDeleteContact();
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);

  const rows = useMemo(
    () =>
      contacts.map((contact) => ({
        contact,
        name:
          [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
          "(sem nome)",
      })),
    [contacts],
  );

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteContact.mutateAsync(pendingDelete.id);
      toast.success("Contato excluído.");
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível excluir: ${error.message}` : "Não foi possível excluir o contato.",
      );
    } finally {
      setPendingDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="via-card p-10 text-center">
        <Users className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        {isFiltered ? (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nenhum contato corresponde ao filtro
            </p>
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Ajuste a busca ou o status para ver outros contatos.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nenhum contato ainda
            </p>
            <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
              Crie o primeiro contato ou importe sua base por CSV. Contatos alimentam negócios,
              conversas de WhatsApp e campanhas.
            </p>
            <Button onClick={onCreate}>Criar primeiro contato</Button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="via-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ contact, name }) => (
              <TableRow
                key={contact.id}
                data-testid="contact-row"
                data-contact-name={name}
                className="cursor-pointer"
                onClick={() => onSelect(contact.id)}
              >
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell>{contact.email ?? "—"}</TableCell>
                <TableCell>{contact.phone ?? contact.whatsapp_phone ?? "—"}</TableCell>
                <TableCell>{contact.company?.name ?? "—"}</TableCell>
                <TableCell>
                  <ContactStatusBadge status={contact.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{contact.lead_score}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {contact.contact_tags.slice(0, 2).map(({ tag }) =>
                      tag ? (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs text-white"
                          style={{ background: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ) : null,
                    )}
                    {contact.contact_tags.length > 2 && (
                      <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                        +{contact.contact_tags.length - 2}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell style={{ color: "var(--via-text-muted)" }}>
                  {formatDate(contact.created_at)}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid="contact-row-actions"
                        aria-label={`Ações para ${name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid="contact-action-edit" onClick={() => onEdit(contact)}>
                        <Pencil className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="contact-action-delete" onClick={() => setPendingDelete(contact)}>
                        <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este contato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contato sai da lista permanentemente. Negócios, atividades e conversas ligados a ele
              deixam de apontar para o contato, mas não são apagados. A ação fica registrada na auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete" onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
