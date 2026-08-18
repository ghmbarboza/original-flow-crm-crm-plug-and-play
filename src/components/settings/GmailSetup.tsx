import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import { useOrgApiKey, useSaveOrgApiKey } from "@/hooks/useOrgApiKey";
import { useConnectGmail } from "@/hooks/useEmailConnection";

/**
 * Configuração do Gmail dentro de Integrações.
 *
 * Antes, este card só empurrava para o Inbox, e lá o botão "Conectar Gmail"
 * respondia "GOOGLE_CLIENT_ID não configurado" — um ciclo sem saída, porque a
 * credencial só existia como secret do Supabase e não havia onde informá-la.
 *
 * Segue o mesmo desenho das outras integrações: campo, tutorial passo a passo e
 * a confirmação de que está configurado.
 */
export function GmailSetup({ conectado }: { conectado: boolean }) {
  const { data: temClientId } = useOrgApiKey("google_client_id");
  const { data: temSecret } = useOrgApiKey("google_client_secret");
  const salvarClientId = useSaveOrgApiKey("google_client_id");
  const salvarSecret = useSaveOrgApiKey("google_client_secret");
  const conectar = useConnectGmail();

  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");

  const pronto = !!temClientId && !!temSecret;
  const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-oauth-callback`;

  const salvar = async () => {
    try {
      if (clientId.trim()) await salvarClientId.mutateAsync(clientId);
      if (secret.trim()) await salvarSecret.mutateAsync(secret);
      setClientId("");
      setSecret("");
      toast.success("Credenciais salvas. Agora conecte a conta do Gmail.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const copiarRedirect = async () => {
    await navigator.clipboard.writeText(redirectUri);
    toast.success("Endereço copiado. Cole no Google Cloud Console.");
  };

  return (
    <div className="space-y-4">
      {conectado ? (
        <p className="flex items-center gap-1.5 text-sm" style={{ color: "var(--via-success)" }}>
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
          Conta de e-mail conectada. As conversas aparecem em Email.
        </p>
      ) : (
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          São dois passos: cadastrar as credenciais do Google (uma vez, por
          empresa) e depois autorizar a conta de e-mail.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="google-client-id">
            Client ID {temClientId && <span style={{ color: "var(--via-success)" }}>· salvo</span>}
          </Label>
          <Input
            id="google-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={temClientId ? "•••••  (deixe vazio para manter)" : "000000-xxxx.apps.googleusercontent.com"}
            data-testid="gmail-client-id"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="google-client-secret">
            Client Secret {temSecret && <span style={{ color: "var(--via-success)" }}>· salvo</span>}
          </Label>
          <Input
            id="google-client-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={temSecret ? "•••••  (deixe vazio para manter)" : "GOCSPX-…"}
            data-testid="gmail-client-secret"
          />
        </div>
      </div>

      {/* O redirect precisa bater caractere a caractere com o cadastrado no
          Google, e digitá-lo à mão é a fonte mais comum de erro no OAuth. */}
      <div className="space-y-1.5">
        <Label className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          URI de redirecionamento — cole esta no Google Cloud Console
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <code
            className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-xs"
            style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}
          >
            {redirectUri}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copiarRedirect} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
            Copiar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ApiKeyTutorialDialog service="google_client_id" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={salvar}
          disabled={(!clientId.trim() && !secret.trim()) || salvarClientId.isPending || salvarSecret.isPending}
          data-testid="gmail-salvar-credenciais"
        >
          {salvarClientId.isPending || salvarSecret.isPending ? (
            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />Salvando…</>
          ) : "Salvar credenciais"}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() =>
            conectar.mutate(undefined, {
              onError: (e) =>
                toast.error(e instanceof Error ? e.message : "Não foi possível conectar."),
            })
          }
          disabled={!pronto || conectar.isPending}
          data-testid="gmail-conectar"
        >
          {conectar.isPending ? "Abrindo o Google…" : conectado ? "Reconectar conta" : "Conectar conta do Gmail"}
        </Button>
      </div>

      {!pronto && (
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Cadastre as duas credenciais para liberar a conexão da conta.
        </p>
      )}
    </div>
  );
}
