import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import { useVerifyMeta } from "@/hooks/useWhatsAppConfig";

interface Props {
  onConnected: () => void;
  onBack: () => void;
}

/** URL pública do webhook que o usuário cola no painel da Meta. */
function webhookUrl() {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  return base ? `${base}/functions/v1/meta-webhook` : "/functions/v1/meta-webhook";
}

export function MetaSetup({ onConnected, onBack }: Props) {
  const verify = useVerifyMeta();
  const [form, setForm] = useState({
    phone_number_id: "",
    business_account_id: "",
    access_token: "",
    display_name: "",
  });
  const [verified, setVerified] = useState<{ phone_number: string | null } | null>(null);

  const handleVerify = async () => {
    if (!form.phone_number_id.trim() || !form.business_account_id.trim() || !form.access_token.trim()) {
      toast.error("Preencha phone number ID, business account ID e access token.");
      return;
    }
    try {
      const result = await verify.mutateAsync({
        phone_number_id: form.phone_number_id.trim(),
        business_account_id: form.business_account_id.trim(),
        access_token: form.access_token.trim(),
        display_name: form.display_name.trim() || undefined,
      });
      setVerified({ phone_number: result.phone_number });
      toast.success("Conta Meta verificada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível verificar a conta Meta.");
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl());
    toast.success("URL do webhook copiada.");
  };

  return (
    <div className="space-y-6">
      <ApiKeyTutorialDialog service="meta_whatsapp" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone_number_id">Phone Number ID</Label>
          <Input
            id="phone_number_id"
            value={form.phone_number_id}
            onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}
            disabled={!!verified}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="business_account_id">Business Account ID</Label>
          <Input
            id="business_account_id"
            value={form.business_account_id}
            onChange={(e) => setForm({ ...form, business_account_id: e.target.value })}
            disabled={!!verified}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="access_token">Access Token</Label>
          <Input
            id="access_token"
            type="password"
            value={form.access_token}
            onChange={(e) => setForm({ ...form, access_token: e.target.value })}
            disabled={!!verified}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="display_name">Nome de exibição (opcional)</Label>
          <Input
            id="display_name"
            placeholder="Atendimento Viver de IA"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            disabled={!!verified}
          />
        </div>
      </div>

      {/* Webhook: o usuário precisa configurar isso no painel da Meta. */}
      <div className="via-card space-y-2 p-4">
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Webhook
        </p>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          No painel da Meta (WhatsApp › Configuração), aponte o webhook para esta URL e assine os
          eventos <span className="font-mono">messages</span>.
        </p>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 truncate rounded-md px-2 py-1.5 text-xs"
            style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}
          >
            {webhookUrl()}
          </code>
          <Button variant="outline" size="icon" onClick={copyWebhook} aria-label="Copiar URL do webhook">
            <Copy className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {verified && (
        <div className="via-card flex items-center gap-3 p-4">
          <CheckCircle2 className="h-6 w-6 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-success)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Conta verificada
            </p>
            {verified.phone_number && (
              <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>{verified.phone_number}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={verify.isPending}>
          Voltar
        </Button>
        {verified ? (
          <Button onClick={onConnected}>Continuar</Button>
        ) : (
          <Button onClick={handleVerify} disabled={verify.isPending}>
            {verify.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                Verificando…
              </>
            ) : (
              "Verificar conta"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
