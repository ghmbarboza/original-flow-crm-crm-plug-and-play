import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useMergeContacts, type Contact } from "@/hooks/useContacts";
import { formatDate } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pair: { a: Contact; b: Contact } | null;
  /** Chamado após um merge bem-sucedido (para a lista de duplicatas se atualizar). */
  onMerged?: () => void;
}

function fullName(c: Contact): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(sem nome)";
}

/** Quantos deals cada lado tem — o critério mais comum para escolher o principal. */
function useDealCounts(pair: Props["pair"], enabled: boolean) {
  return useQuery({
    queryKey: ["merge-deal-counts", pair?.a.id, pair?.b.id],
    enabled: enabled && !!pair,
    queryFn: async (): Promise<Record<string, number>> => {
      const counts: Record<string, number> = {};
      for (const contact of [pair!.a, pair!.b]) {
        const { count, error } = await supabase
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contact.id);
        if (error) throw error;
        counts[contact.id] = count ?? 0;
      }
      return counts;
    },
  });
}

/**
 * Tela de merge da Parte 7 do Sprint 10A: compara os dois contatos lado a
 * lado, o usuário escolhe qual sobrevive, e o merge transfere deals,
 * histórico e conversas para o principal, desativando o outro (não deleta).
 */
export function MergeContactsDialog({ open, onOpenChange, pair, onMerged }: Props) {
  const merge = useMergeContacts();
  const { data: dealCounts } = useDealCounts(pair, open);
  const [keepId, setKeepId] = useState<string | null>(null);

  // A escolha padrão é o contato mais antigo — normalmente o que tem histórico.
  useEffect(() => {
    if (!open || !pair) return;
    setKeepId(pair.a.created_at <= pair.b.created_at ? pair.a.id : pair.b.id);
  }, [open, pair]);

  if (!pair) return null;

  const contatos = [pair.a, pair.b];
  const absorvido = contatos.find((c) => c.id !== keepId);

  const confirmar = async () => {
    if (!keepId || !absorvido) return;
    try {
      await merge.mutateAsync({ keepId, mergeId: absorvido.id });
      toast.success("Contatos mesclados.");
      onOpenChange(false);
      onMerged?.();
    } catch (e) {
      toast.error(e instanceof Error ? `Não foi possível mesclar: ${e.message}` : "Não foi possível mesclar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="merge-dialog">
        <DialogHeader>
          <DialogTitle>Mesclar contatos</DialogTitle>
          <DialogDescription>
            Escolha qual contato permanece como principal. Nada é apagado: o outro é desativado e
            todo o histórico dele passa para o principal.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {contatos.map((c) => {
            const selecionado = keepId === c.id;
            return (
              <label
                key={c.id}
                className="via-card cursor-pointer space-y-1.5 p-4 transition-shadow"
                style={selecionado ? { outline: "2px solid var(--via-brand, currentColor)", outlineOffset: 0 } : undefined}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="merge-keep"
                    checked={selecionado}
                    onChange={() => setKeepId(c.id)}
                    data-testid={`merge-keep-${c.id}`}
                  />
                  <span className="font-medium" style={{ color: "var(--via-text-primary)" }}>
                    {fullName(c)}
                  </span>
                </span>
                <span className="block text-sm" style={{ color: "var(--via-text-body)" }}>
                  {c.email ?? "Sem email"}
                </span>
                <span className="block text-sm" style={{ color: "var(--via-text-body)" }}>
                  {c.phone ?? c.whatsapp_phone ?? "Sem telefone"}
                </span>
                <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>
                  {dealCounts ? `${dealCounts[c.id] ?? 0} negócio(s) vinculado(s) · ` : ""}
                  Criado em {formatDate(c.created_at)}
                </span>
              </label>
            );
          })}
        </div>

        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--via-border)", color: "var(--via-text-body)" }}>
          <p className="mb-1 font-medium" style={{ color: "var(--via-text-primary)" }}>O que acontece</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Negócios, histórico, conversas e mensagens programadas passam para o principal.</li>
            <li>Campos vazios do principal são completados com os dados do outro contato.</li>
            <li>{absorvido ? fullName(absorvido) : "O outro contato"} é desativado — não deletado.</li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={merge.isPending || !keepId} data-testid="merge-confirm">
            {merge.isPending ? "Mesclando…" : "Mesclar contatos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
