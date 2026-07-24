import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, UserPlus } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useContacts, useCreateContact } from "@/hooks/useContacts";
import { useLinkConversationContact, type Conversation } from "@/hooks/useConversations";

interface Props {
  conversation: Conversation | null;
  onOpenChange: (open: boolean) => void;
}

/** Vincula a conversa a um contato existente ou cria um novo a partir do canal. */
export function LinkContactDialog({ conversation, onOpenChange }: Props) {
  const { data: contacts, isLoading } = useContacts();
  const createContact = useCreateContact();
  const linkContact = useLinkConversationContact();
  const [search, setSearch] = useState("");

  const suggestedName = conversation?.channel_contact_name?.trim() || "";

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = contacts ?? [];
    if (!term) return list.slice(0, 8);
    return list
      .filter((c) => `${c.first_name} ${c.last_name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [contacts, search]);

  const link = async (contactId: string) => {
    if (!conversation) return;
    try {
      await linkContact.mutateAsync({ id: conversation.id, contactId });
      toast.success("Contato vinculado à conversa.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível vincular.");
    }
  };

  const createAndLink = async () => {
    if (!conversation) return;
    const [first, ...rest] = (suggestedName || conversation.phone_number).split(" ");
    try {
      const created = await createContact.mutateAsync({
        first_name: first,
        last_name: rest.join(" ") || null,
        whatsapp_phone: conversation.channel === "whatsapp" ? conversation.phone_number : null,
        status: "lead",
        source: conversation.channel ?? "whatsapp",
      });
      await linkContact.mutateAsync({ id: conversation.id, contactId: created.id });
      toast.success("Contato criado e vinculado.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o contato.");
    }
  };

  const busy = createContact.isPending || linkContact.isPending;

  return (
    <Dialog open={!!conversation} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular contato</DialogTitle>
          <DialogDescription>
            Associe esta conversa a um contato do CRM ou crie um novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <Input
              className="pl-8"
              placeholder="Buscar contato por nome ou email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border" style={{ borderColor: "var(--via-border)" }}>
            {isLoading ? (
              <p className="p-3 text-sm" style={{ color: "var(--via-text-muted)" }}>Carregando…</p>
            ) : matches.length === 0 ? (
              <p className="p-3 text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhum contato encontrado.</p>
            ) : (
              <ul>
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => link(c.id)}
                      disabled={busy}
                      className="flex w-full flex-col border-b px-3 py-2 text-left transition-colors hover:bg-[var(--via-surface)] disabled:opacity-60"
                      style={{ borderColor: "var(--via-border)" }}
                    >
                      <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                        {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                      </span>
                      {c.email && <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>{c.email}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button onClick={createAndLink} disabled={busy} className="w-full gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> : <UserPlus className="h-4 w-4" strokeWidth={1.5} />}
            Criar novo{suggestedName ? `: “${suggestedName}”` : " contato"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
