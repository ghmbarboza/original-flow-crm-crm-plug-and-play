import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Info, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function DemonstrationSettings() {
  const [hasDemoData, setHasDemoData] = useState(false);

  const loadDemoData = () => {
    setHasDemoData(true);
    toast.success("Dados de demonstração carregados!");
  };

  const clearDemoData = () => {
    setHasDemoData(false);
    toast.success("Dados removidos.");
  };

  return (
    <div className="space-y-4">


      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold">Dados de demonstração</CardTitle>
              <CardDescription className="text-sm">
                Gerencie a presença de dados fictícios na plataforma para fins de demonstração.
              </CardDescription>
            </div>
            {hasDemoData ? (
              <Badge className="bg-success text-success-foreground">Dados carregados</Badge>
            ) : (
              <Badge variant="secondary">Sem dados</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={loadDemoData} disabled={hasDemoData}>
            Carregar dados de demonstração
          </Button>
          <Button
            variant="outline"
            onClick={clearDemoData}
            disabled={!hasDemoData}
            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Remover dados de demonstração
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
