import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiKeyDialog } from "@/components/settings/ApiKeyDialog";
import { useInvalidateApiKeysRegistry } from "@/hooks/useApiKeysRegistry";

/** Ação discreta no topo da aba Integrações: cadastrar uma chave de API. */
export function NewApiKeyButton() {
  const [open, setOpen] = useState(false);
  const invalidar = useInvalidateApiKeysRegistry();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        data-testid="nova-chave-api"
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} /> Nova chave
      </Button>
      <ApiKeyDialog open={open} onOpenChange={setOpen} onSaved={invalidar} />
    </>
  );
}