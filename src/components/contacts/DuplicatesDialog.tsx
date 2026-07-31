import { useMemo, useState } from "react";
import { GitMerge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MergeContactsDialog } from "@/components/contacts/MergeContactsDialog";
import { findDuplicatePairs } from "@/lib/duplicates";
import type { Contact } from "@/hooks/useContacts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
}

function nome(c: Contact): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.email || "(sem nome)";
}

/**
 * "Verificar duplicatas" em /contacts (Parte 7 do Sprint 10A): varre a lista
 * carregada e mostra pares com mesmo email, telefone ou nome, cada um com o
 * atalho para a tela de merge.
 */
export function DuplicatesDialog({ open, onOpenChange, contacts }: Props) {
  const [mergingPair, setMergingPair] = useState<{ a: Contact; b: Contact } | null>(null);

  const pairs = useMemo(() => (open ? findDuplicatePairs(contacts) : []), [open, contacts]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl" data-testid="duplicates-dialog">
          <DialogHeader>
            <DialogTitle>Possíveis duplicatas</DialogTitle>
            <DialogDescription>
              Pares de contatos com o mesmo email, telefone ou nome. Mesclar transfere todo o
              histórico para o contato principal e desativa o outro.
            </DialogDescription>
          </DialogHeader>

          {pairs.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
              Nenhuma duplicata encontrada. 🎉
            </p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {pairs.map((pair) => (
                <li
                  key={`${pair.a.id}-${pair.b.id}`}
                  className="via-card flex flex-wrap items-center gap-3 p-3"
                  data-testid="duplicate-pair"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                      {nome(pair.a)} · {nome(pair.b)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {pair.reasons.map((reason) => (
                        <Badge key={reason} variant="secondary" className="text-xs font-normal">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setMergingPair({ a: pair.a, b: pair.b })}
                    data-testid="duplicate-merge"
                  >
                    <GitMerge className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Mesclar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <MergeContactsDialog
        open={!!mergingPair}
        onOpenChange={(o) => !o && setMergingPair(null)}
        pair={mergingPair}
      />
    </>
  );
}
