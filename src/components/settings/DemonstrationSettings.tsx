import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorState } from "@/components/ErrorState";
import { Database, Info, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useClearDemo, useDemoStatus, useSeedDemo } from "@/hooks/useDemoData";

export default function DemonstrationSettings() {
  const { data: hasDemoData, isLoading, error, refetch } = useDemoStatus();
  const seedDemo = useSeedDemo();
  const clearDemo = useClearDemo();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSeed = async () => {
    try {
      const result = await seedDemo.mutateAsync();
      if (result.skipped) {
        toast.info("Os dados de demonstração já estavam presentes.");
      } else {
        toast.success("Dados de demonstração criados!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar os dados.");
    }
  };

  const handleClear = async () => {
    setConfirmOpen(false);
    try {
      await clearDemo.mutateAsync();
      toast.success("Dados de demonstração removidos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover os dados.");
    }
  };

  const busy = seedDemo.isPending || clearDemo.isPending;

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Os dados de demonstração são fictícios (empresas, contatos, negócios, atividades e
          produtos) e ficam marcados internamente. Você pode removê-los a qualquer momento sem
          afetar seus dados reais.
        </AlertDescription>
      </Alert>

      {error ? (
        <ErrorState
          title="Não foi possível verificar os dados de demonstração"
          error={error}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">Dados de demonstração</CardTitle>
                <CardDescription className="text-sm">
                  Gerencie a presença de dados fictícios na plataforma para fins de demonstração.
                </CardDescription>
              </div>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : hasDemoData ? (
                <Badge className="bg-success text-success-foreground">Dados carregados</Badge>
              ) : (
                <Badge variant="secondary">Sem dados</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={handleSeed} disabled={isLoading || busy || hasDemoData === true}>
              {seedDemo.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-1 h-4 w-4" />
              )}
              Popular dados de demonstração
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={isLoading || busy || hasDemoData !== true}
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              {clearDemo.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Limpar dados de demonstração
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar dados de demonstração?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os registros fictícios (empresas, contatos, negócios, atividades e produtos)
              serão removidos permanentemente. Seus dados reais não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear}>Limpar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
