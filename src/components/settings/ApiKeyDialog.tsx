import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import { API_KEY_TUTORIALS, tutorialDoServico } from "@/lib/apiKeyTutorials";

/**
 * Diálogo de cadastro/alteração de chave de API — mesmo conteúdo de antes
 * (chips de serviços sugeridos + tutorial passo a passo), agora isolado para
 * ser aberto tanto pelo botão do topo da aba quanto pela lista do fim.
 */
export function ApiKeyDialog({
  open,
  onOpenChange,
  service = null,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Serviço em edição; `null` cadastra uma chave nova. */
  service?: string | null;
  onSaved?: () => void;
}) {
  const [serviceName, setServiceName] = useState(service ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setServiceName(service ?? "");
    setApiKey("");
    setShowKey(false);
  }, [open, service]);

  const save = async () => {
    const sn = serviceName.trim();
    if (!sn || !apiKey) { toast.error("Preencha serviço e chave"); return; }
    setSalvando(true);
    const { data, error } = await supabase.functions.invoke("store-api-key", {
      body: { service_name: sn, api_key: apiKey, label: sn },
    });
    setApiKey(""); // nunca manter o valor em memória depois do envio
    setSalvando(false);
    if (error) { toast.error((await erroDeFunction(error, "Falha ao salvar chave.")).message); return; }
    if (!data?.success) { toast.error(data?.error ?? "Falha ao salvar chave."); return; }
    toast.success("Chave armazenada com segurança");
    onOpenChange(false);
    onSaved?.();
  };

  const tip = tutorialDoServico(serviceName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Alterar chave" : "Nova chave"}</DialogTitle>
          <DialogDescription>
            A chave é guardada no cofre e nunca volta para a tela depois de salva.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key-service">Serviço</Label>
            <Input
              id="api-key-service"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              disabled={!!service}
              placeholder="ex: openai"
            />
            {!service && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(API_KEY_TUTORIALS).map(([key, t]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setServiceName(key)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      serviceName === key ? "border-primary bg-muted" : "border-border hover:bg-muted"
                    }`}
                    data-testid="api-key-suggestion"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key-value">Chave de API</Label>
            <div className="relative">
              <Input
                id="api-key-value"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "Ocultar a chave" : "Mostrar a chave"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {tip && (
            <div className="flex flex-wrap items-center gap-4">
              <ApiKeyTutorialDialog service={serviceName} />
              <a
                href={tip.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Como obter a chave de {tip.label}
              </a>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={salvando}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}