import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiKeyDialog } from "@/components/settings/ApiKeyDialog";
import { useApiKeysRegistry, useInvalidateApiKeysRegistry } from "@/hooks/useApiKeysRegistry";

type StatusChave = "valid" | "invalid" | "unconfigured" | "checking" | undefined;

/**
 * Lista compacta das chaves já cadastradas, exibida no fim da aba Integrações.
 * Sem chaves não há nada para explicar — o componente não renderiza nada.
 */
export function ApiKeysList() {
  const { data: chaves } = useApiKeysRegistry();
  const invalidar = useInvalidateApiKeysRegistry();
  const [status, setStatus] = useState<Record<string, StatusChave>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState<string | null>(null);

  const remover = async (servico: string) => {
    const { error } = await supabase.functions.invoke("delete-api-key", {
      body: { service_name: servico },
    });
    if (error) { toast.error((await erroDeFunction(error, "Falha ao remover a chave.")).message); return; }
    toast.success("Chave removida");
    setConfirmarRemocao(null);
    invalidar();
  };

  const testar = async (servico: string) => {
    const anterior = status[servico];
    setStatus((p) => ({ ...p, [servico]: "checking" }));
    const { data, error } = await supabase.functions.invoke("validate-api-key", {
      body: { service_name: servico },
    });

    // Falha da function não é veredito sobre a chave do usuário.
    if (error) {
      setStatus((p) => ({ ...p, [servico]: anterior }));
      toast.error((await erroDeFunction(error, "Não foi possível validar a chave.")).message);
      return;
    }

    setStatus((p) => ({ ...p, [servico]: (data?.status as StatusChave) ?? "invalid" }));
    if (data?.status === "valid") toast.success("Chave válida");
    else toast.error("Chave inválida");
  };

  if (!chaves || chaves.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="chaves-cadastradas">
      <h3
        className="flex items-center gap-2 text-sm font-medium"
        style={{ color: "var(--via-text-primary)" }}
      >
        <KeyRound className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Chaves cadastradas
      </h3>
      <ul className="divide-y rounded-lg border">
        {chaves.map((chave) => {
          const st = status[chave.service_name];
          return (
            <li
              key={chave.service_name}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  {chave.service_name}
                </span>
                {chave.label && chave.label !== chave.service_name && (
                  <span className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                    {chave.label}
                  </span>
                )}
                {st === "valid" ? (
                  <Badge className="bg-success text-success-foreground">Ativa</Badge>
                ) : st === "invalid" ? (
                  <Badge variant="destructive">Inválida</Badge>
                ) : (
                  <Badge variant="secondary">
                    {st === "checking" ? "Verificando…" : "Não verificada"}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditando(chave.service_name)}>
                  Alterar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={st === "checking"}
                  onClick={() => testar(chave.service_name)}
                >
                  Testar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmarRemocao(chave.service_name)}
                >
                  Remover
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <ApiKeyDialog
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
        service={editando}
        onSaved={invalidar}
      />

      <AlertDialog
        open={!!confirmarRemocao}
        onOpenChange={(o) => !o && setConfirmarRemocao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover chave?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A chave será removida do cofre.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmarRemocao && remover(confirmarRemocao)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}