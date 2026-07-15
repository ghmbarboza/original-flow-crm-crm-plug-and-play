import { useState } from "react";
import { toast } from "sonner";
import { Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VIA_STAGE_COLORS } from "@/lib/via-colors";
import { useCreateTag, useDeleteTag, useTags, useUpdateTag, type Tag } from "@/hooks/useTags";
import { cn } from "@/lib/utils";

/** Seletor de cor restrito à paleta VIA — nunca um input[type=color] livre. */
function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VIA_STAGE_COLORS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.label}
          aria-label={option.label}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
            value === option.value && "ring-2 ring-via-navy",
          )}
          style={{ background: option.value }}
        />
      ))}
    </div>
  );
}

export function TagsPanel() {
  const { data: tags, isLoading } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(VIA_STAGE_COLORS[0].value);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Dê um nome para a tag.");
      return;
    }
    try {
      await createTag.mutateAsync({ name: name.trim(), color });
      setName("");
      toast.success("Tag criada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a tag.");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTag.mutateAsync(pendingDelete.id);
      toast.success("Tag removida dos contatos que a usavam.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a tag.");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={handleCreate} className="via-card space-y-3 p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="tag-name" className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Nova tag
            </label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cliente ativo, VIP, Retomar contato…"
            />
          </div>
          <Button type="submit" disabled={createTag.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Criar
          </Button>
        </div>
        <ColorPicker value={color} onChange={setColor} />
      </form>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (tags ?? []).length === 0 ? (
        <div className="via-card p-8 text-center">
          <TagIcon className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Nenhuma tag ainda
          </p>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Tags segmentam contatos para campanhas, grupos dinâmicos e filtros de relatório.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {(tags ?? []).map((tag) => (
            <li key={tag.id} className="via-card flex items-center gap-3 p-3">
              <ColorPicker
                value={tag.color}
                onChange={(nextColor) =>
                  updateTag.mutate(
                    { id: tag.id, color: nextColor },
                    {
                      onError: (error) =>
                        toast.error(error instanceof Error ? error.message : "Não foi possível mudar a cor."),
                    },
                  )
                }
              />
              <Input
                defaultValue={tag.name}
                className="h-8 flex-1"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (!next || next === tag.name) {
                    e.target.value = tag.name;
                    return;
                  }
                  updateTag.mutate(
                    { id: tag.id, name: next },
                    {
                      onError: (error) => {
                        e.target.value = tag.name;
                        toast.error(error instanceof Error ? error.message : "Não foi possível renomear.");
                      },
                    },
                  );
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Excluir tag ${tag.name}`}
                onClick={() => setPendingDelete(tag)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a tag "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A tag será removida de todos os contatos que a usam. Os contatos não são afetados.
              Grupos dinâmicos que filtram por ela deixarão de encontrar resultados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
