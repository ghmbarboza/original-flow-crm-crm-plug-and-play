import { useRef, useState } from "react";
import { toast } from "sonner";
import { MessageSquareText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useDeleteQuickReply, useImportQuickReplies, useQuickReplies, useSaveQuickReply,
  type QuickReply,
} from "@/hooks/useQuickReplies";
import { parseCsv } from "@/lib/csv";

/**
 * Configurações > Atendimento — hoje só Respostas rápidas; o SLA (Parte 8 do
 * Sprint 10A) entra aqui quando chegar.
 *
 * As respostas são da organização inteira: qualquer agente usa, qualquer um
 * cadastra. Variáveis suportadas na mensagem: {{contact.first_name}},
 * {{contact.last_name}}, {{contact.name}}.
 */
export default function AtendimentoSettings() {
  const { data: respostas, isLoading } = useQuickReplies();
  const salvar = useSaveQuickReply();
  const excluir = useDeleteQuickReply();
  const importar = useImportQuickReplies();

  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<QuickReply | null>(null);
  const [form, setForm] = useState({ shortcut: "", title: "", message: "", category: "" });
  const [apagando, setApagando] = useState<QuickReply | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const abrirNova = () => {
    setEditando(null);
    setForm({ shortcut: "", title: "", message: "", category: "" });
    setFormOpen(true);
  };

  const abrirEdicao = (r: QuickReply) => {
    setEditando(r);
    setForm({ shortcut: r.shortcut, title: r.title, message: r.message, category: r.category ?? "" });
    setFormOpen(true);
  };

  const submeter = async () => {
    if (!form.shortcut.trim() || !form.title.trim() || !form.message.trim()) {
      toast.error("Atalho, título e mensagem são obrigatórios.");
      return;
    }
    try {
      await salvar.mutateAsync({
        id: editando?.id,
        shortcut: form.shortcut,
        title: form.title.trim(),
        message: form.message,
        category: form.category.trim() || null,
        is_active: editando?.is_active ?? true,
      });
      setFormOpen(false);
      toast.success(editando ? "Resposta atualizada." : "Resposta criada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a resposta.");
    }
  };

  const confirmarExclusao = async () => {
    if (!apagando) return;
    try {
      await excluir.mutateAsync(apagando.id);
      toast.success("Resposta excluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setApagando(null);
    }
  };

  const importarCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { headers, rows } = parseCsv(await file.text());
      const idx = (nome: string) => headers.findIndex((h) => h.trim().toLowerCase() === nome);
      const iShortcut = idx("shortcut");
      const iTitle = idx("title");
      const iMessage = idx("message");
      const iCategory = idx("category");
      if (iShortcut < 0 || iTitle < 0 || iMessage < 0) {
        toast.error("O CSV precisa das colunas shortcut, title e message (category é opcional).");
        return;
      }
      const { importadas, ignoradas } = await importar.mutateAsync(
        rows.map((r) => ({
          shortcut: r[iShortcut] ?? "",
          title: r[iTitle] ?? "",
          message: r[iMessage] ?? "",
          category: iCategory >= 0 ? r[iCategory] : null,
        })),
      );
      toast.success(`${importadas} resposta(s) importada(s)${ignoradas ? ` · ${ignoradas} linha(s) incompleta(s) ignorada(s)` : ""}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível importar o CSV.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
            Respostas rápidas
          </h3>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            O agente digita <code>/</code> no campo de mensagem do inbox e escolhe da lista.
            Variáveis: {"{{contact.first_name}}"}, {"{{contact.last_name}}"}, {"{{contact.name}}"}.
          </p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importarCsv} />
          <Button variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={importar.isPending}>
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            Importar CSV
          </Button>
          <Button className="gap-1.5" onClick={abrirNova} data-testid="quick-reply-nova">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova resposta
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (respostas ?? []).length === 0 ? (
        <div className="via-card p-8 text-center">
          <MessageSquareText className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Nenhuma resposta rápida ainda
          </p>
          <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
            Cadastre as mensagens que o time digita todo dia — proposta, preço, link do site — e
            elas ficam a um <code>/</code> de distância no inbox.
          </p>
          <div className="flex justify-center">
            <Button onClick={abrirNova} className="gap-1.5">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Criar a primeira
            </Button>
          </div>
        </div>
      ) : (
        <div className="via-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Atalho</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Ativa</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(respostas ?? []).map((r) => (
                <TableRow key={r.id} data-testid="quick-reply-row">
                  <TableCell className="font-medium">/{r.shortcut}</TableCell>
                  <TableCell>{r.title}</TableCell>
                  <TableCell className="max-w-64">
                    <span className="line-clamp-1" style={{ color: "var(--via-text-body)" }}>{r.message}</span>
                  </TableCell>
                  <TableCell>{r.category ?? "—"}</TableCell>
                  <TableCell>
                    <Switch
                      aria-label={`Ativar a resposta /${r.shortcut}`}
                      checked={r.is_active}
                      onCheckedChange={(v) =>
                        salvar.mutate({ id: r.id, shortcut: r.shortcut, title: r.title, message: r.message, category: r.category, is_active: v })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Editar /${r.shortcut}`} onClick={() => abrirEdicao(r)}>
                        <Pencil className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Excluir /${r.shortcut}`} onClick={() => setApagando(r)}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? `Editar /${editando.shortcut}` : "Nova resposta rápida"}</DialogTitle>
            <DialogDescription>
              O atalho é o que o agente digita depois da barra. A mensagem aceita variáveis do
              contato, substituídas na hora do uso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="qr-shortcut">Atalho</Label>
                <Input
                  id="qr-shortcut"
                  placeholder="proposta"
                  value={form.shortcut}
                  onChange={(e) => setForm({ ...form, shortcut: e.target.value })}
                  data-testid="quick-reply-shortcut"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-category">Categoria (opcional)</Label>
                <Input
                  id="qr-category"
                  placeholder="Vendas"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qr-title">Título</Label>
              <Input
                id="qr-title"
                placeholder="Enviar proposta"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                data-testid="quick-reply-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qr-message">Mensagem</Label>
              <Textarea
                id="qr-message"
                rows={4}
                placeholder="Olá {{contact.first_name}}! Segue nossa proposta…"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                data-testid="quick-reply-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={submeter} disabled={salvar.isPending} data-testid="quick-reply-salvar">
              {editando ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!apagando} onOpenChange={(open) => !open && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir /{apagando?.shortcut}?</AlertDialogTitle>
            <AlertDialogDescription>
              A resposta some da lista do inbox para todos os agentes.
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
