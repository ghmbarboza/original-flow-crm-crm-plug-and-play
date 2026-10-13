import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useCreatePipeline, useDeletePipeline, useRenamePipeline, useSetDefaultPipeline, type Pipeline,
} from "@/hooks/usePipelines";
import type { PipelineStage } from "@/hooks/useDeals";
import { MAX_NOME_FUNIL, validarNomeFunil } from "@/lib/funis";
import { VIA_STAGE_COLORS } from "@/lib/via-colors";

// Funil criado do zero nasce com uma etapa, para o Kanban dele ter coluna.
const ETAPA_INICIAL = { name: "Primeira etapa", color: VIA_STAGE_COLORS[0].value, win_probability: 10 };

interface Props {
  funis: Pipeline[];
  funil: Pipeline | null;
  /** Etapas do funil aberto: servem de modelo para um funil novo. */
  etapas: PipelineStage[];
  onEscolher: (id: string) => void;
}

/**
 * Barra dos funis em Configurações > Automações > Funil: escolher o funil que
 * está sendo editado, criar, renomear, tornar padrão e excluir.
 */
export function FunilToolbar({ funis, funil, etapas, onEscolher }: Props) {
  const tornarPadrao = useSetDefaultPipeline();
  const [dialogo, setDialogo] = useState<"novo" | "renomear" | "excluir" | null>(null);

  const handleTornarPadrao = async () => {
    if (!funil) return;
    try {
      await tornarPadrao.mutateAsync(funil.id);
      toast.success(`"${funil.name}" agora é o funil padrão.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível trocar o funil padrão.");
    }
  };

  return (
    <div className="via-card flex flex-wrap items-center gap-2 p-4" data-testid="funil-toolbar">
      <Select value={funil?.id ?? ""} onValueChange={onEscolher}>
        <SelectTrigger className="w-60" aria-label="Funil em edição" data-testid="funil-select">
          <SelectValue placeholder="Escolha um funil" />
        </SelectTrigger>
        <SelectContent>
          {funis.map((f) => (
            <SelectItem key={f.id} value={f.id}>{f.name}{f.is_default ? " (padrão)" : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {funil?.is_default && <Badge variant="secondary">Padrão</Badge>}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {funil && !funil.is_default && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleTornarPadrao} disabled={tornarPadrao.isPending} data-testid="funil-tornar-padrao">
            <Star className="h-3.5 w-3.5" strokeWidth={1.5} />
            Tornar padrão
          </Button>
        )}
        {funil && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogo("renomear")} data-testid="funil-renomear">
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
            Renomear
          </Button>
        )}
        {funil && !funil.is_default && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialogo("excluir")} data-testid="funil-excluir">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Excluir funil
          </Button>
        )}
        <Button size="sm" className="gap-1.5" onClick={() => setDialogo("novo")} data-testid="funil-novo">
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          Novo funil
        </Button>
      </div>

      <p className="w-full text-xs" style={{ color: "var(--via-text-muted)" }}>
        Negócios criados sozinhos (conversa nova, IA, formulário sem destino, integrações) entram no funil padrão.
        A IA e as automações movem cada negócio só dentro do funil em que ele está.
      </p>

      {dialogo === "novo" && (
        <FunilNomeDialog
          titulo="Novo funil"
          descricao="Cada funil tem as próprias etapas e o próprio Kanban."
          funis={funis}
          modelo={funil && etapas.length > 0 ? { nome: funil.name, etapas } : null}
          onClose={() => setDialogo(null)}
          onCriado={onEscolher}
        />
      )}
      {dialogo === "renomear" && funil && (
        <FunilNomeDialog
          titulo="Renomear funil"
          descricao="O novo nome aparece no Kanban, nos formulários e nas configurações."
          funis={funis}
          emEdicao={funil}
          modelo={null}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === "excluir" && funil && (
        <FunilExcluirDialog funil={funil} onClose={() => setDialogo(null)} />
      )}
    </div>
  );
}

interface NomeProps {
  titulo: string;
  descricao: string;
  funis: Pipeline[];
  /** Funil sendo renomeado; ausente quando é criação. */
  emEdicao?: Pipeline;
  /** Funil cujas etapas podem ser copiadas para o novo. */
  modelo: { nome: string; etapas: PipelineStage[] } | null;
  onClose: () => void;
  onCriado?: (id: string) => void;
}

function FunilNomeDialog({ titulo, descricao, funis, emEdicao, modelo, onClose, onCriado }: NomeProps) {
  const criar = useCreatePipeline();
  const renomear = useRenamePipeline();
  const [nome, setNome] = useState(emEdicao?.name ?? "");
  const [copiar, setCopiar] = useState(true);

  const erro = validarNomeFunil(nome, funis.filter((f) => f.id !== emEdicao?.id).map((f) => f.name));
  const salvando = criar.isPending || renomear.isPending;

  const handleSalvar = async () => {
    if (erro) return;
    try {
      if (emEdicao) {
        await renomear.mutateAsync({ id: emEdicao.id, name: nome.trim() });
        toast.success("Funil renomeado.");
      } else {
        const etapas = copiar && modelo
          ? modelo.etapas.map((e) => ({ name: e.name, color: e.color, win_probability: e.win_probability }))
          : [ETAPA_INICIAL];
        const id = await criar.mutateAsync({ name: nome.trim(), etapas });
        toast.success("Funil criado.");
        onCriado?.(id);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o funil.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="funil-form-dialog">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="funil-nome">Nome</Label>
            <Input
              id="funil-nome"
              data-testid="funil-nome"
              value={nome}
              maxLength={MAX_NOME_FUNIL}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Pós-venda"
              autoFocus
            />
            {nome && erro && <p className="text-xs text-via-coral" role="alert">{erro}</p>}
          </div>
          {!emEdicao && modelo && (
            <label className="flex items-start gap-2 text-sm" style={{ color: "var(--via-text-primary)" }}>
              <Checkbox checked={copiar} onCheckedChange={(v) => setCopiar(v === true)} data-testid="funil-copiar-etapas" className="mt-0.5" />
              <span>
                Começar com as mesmas etapas de "{modelo.nome}"
                <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Copia nome, cor e probabilidade. Mensagens automáticas e campos obrigatórios não são copiados.
                </span>
              </span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={!!erro || salvando} data-testid="funil-form-salvar">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FunilExcluirDialog({ funil, onClose }: { funil: Pipeline; onClose: () => void }) {
  const excluir = useDeletePipeline();

  const handleExcluir = async () => {
    try {
      await excluir.mutateAsync(funil.id);
      toast.success("Funil excluído.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o funil.");
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-testid="funil-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir o funil "{funil.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            O funil sai junto com todas as etapas e as configurações delas. Se alguma etapa ainda tiver negócio,
            a exclusão é recusada e nada muda. Formulários que entregavam neste funil passam a usar o funil padrão.
            Não dá para desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void handleExcluir(); }}
            disabled={excluir.isPending}
            data-testid="funil-delete-confirmar"
          >
            Excluir funil
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
