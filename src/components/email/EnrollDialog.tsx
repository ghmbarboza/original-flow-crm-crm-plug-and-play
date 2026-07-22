import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useContacts } from "@/hooks/useContacts";
import { useEnrollContacts } from "@/hooks/useEmailSequences";

interface Props {
  sequenceId: string | null;
  onOpenChange: (open: boolean) => void;
}

/** Seleciona contatos (com email) para inscrever numa sequência. */
export function EnrollDialog({ sequenceId, onOpenChange }: Props) {
  const { data: contacts } = useContacts();
  const enroll = useEnrollContacts();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    // Só contatos com email podem entrar numa sequência de email.
    return (contacts ?? [])
      .filter((c) => c.email)
      .filter((c) => {
        if (!term) return true;
        const hay = [c.first_name, c.last_name, c.email].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(term);
      });
  }, [contacts, search]);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const submit = async () => {
    if (!sequenceId || selected.size === 0) {
      toast.error("Selecione ao menos um contato.");
      return;
    }
    try {
      const { enrolled } = await enroll.mutateAsync({ sequenceId, contactIds: [...selected] });
      toast.success(enrolled > 0 ? `${enrolled} contato(s) inscrito(s).` : "Todos já estavam inscritos.");
      setSelected(new Set());
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível inscrever.");
    }
  };

  return (
    <Dialog open={!!sequenceId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Inscrever contatos</DialogTitle>
          <DialogDescription>Apenas contatos com email aparecem aqui.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <Input className="pl-8" placeholder="Buscar contato" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>Nenhum contato com email.</p>
          ) : (
            filtered.map((contact) => {
              const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || contact.email;
              return (
                <label key={contact.id} className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-accent">
                  <Checkbox checked={selected.has(contact.id)} onCheckedChange={(c) => toggle(contact.id, c === true)} />
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--via-text-muted)" }}>{contact.email}</span>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={enroll.isPending || selected.size === 0}>
            Inscrever {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
