import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Mail, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import { GmailSetup } from "@/components/settings/GmailSetup";
import { useEmailConnection } from "@/hooks/useEmailConnection";
import { useOrgApiKey, useSaveOrgApiKey } from "@/hooks/useOrgApiKey";
import {
  useCheckEmailDomain, useEmailSettings, useSaveEmailSettings, useSendTestEmail,
  type DomainStatus, type EmailProvider,
} from "@/hooks/useEmailSettings";

/**
 * Configurações > E-mail: por onde os e-mails da organização saem.
 *
 * Resend é o e-mail de sistema (notificações, automações, sequências) e sai em
 * nome da empresa. Gmail é a conta pessoal conectada por OAuth, usada nas
 * respostas do inbox e como reserva quando o Resend não está pronto.
 */
export default function EmailSettings() {
  const { data: config, isLoading } = useEmailSettings();
  const salvar = useSaveEmailSettings();
  const verificarDominio = useCheckEmailDomain();
  const enviarTeste = useSendTestEmail();
  const { data: gmail } = useEmailConnection();
  const { data: temChaveResend } = useOrgApiKey("resend");
  const salvarChave = useSaveOrgApiKey("resend");

  const [provider, setProvider] = useState<EmailProvider>("gmail");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [chave, setChave] = useState("");
  const [dominio, setDominio] = useState<DomainStatus | null>(null);

  useEffect(() => {
    if (!config) return;
    setProvider(config.provider === "resend" ? "resend" : "gmail");
    setFromName(config.from_name ?? "");
    setFromEmail(config.from_email ?? "");
    setReplyTo(config.reply_to ?? "");
  }, [config]);

  const salvarRemetente = async () => {
    try {
      await salvar.mutateAsync({
        provider,
        from_name: fromName.trim() || null,
        from_email: fromEmail.trim().toLowerCase() || null,
        reply_to: replyTo.trim().toLowerCase() || null,
      });
      toast.success("Configuração de e-mail salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const salvarChaveResend = async () => {
    try {
      await salvarChave.mutateAsync(chave);
      setChave("");
      toast.success("Chave do Resend salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a chave.");
    }
  };

  const conferirDominio = async () => {
    try {
      const r = await verificarDominio.mutateAsync();
      setDominio(r);
      toast[r.verified ? "success" : "warning"](
        r.verified ? `Domínio ${r.domain} verificado.` : r.found ? `Domínio ${r.domain} ainda não verificado.` : `Domínio ${r.domain} não está cadastrado no Resend.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível consultar o domínio.");
    }
  };

  const testar = async () => {
    try {
      const r = await enviarTeste.mutateAsync();
      toast.success(`E-mail de teste enviado para ${r.to} pelo ${r.provider === "resend" ? "Resend" : "Gmail"}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o teste.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const resendPronto = !!temChaveResend && !!fromEmail.trim();

  return (
    <div className="space-y-6" data-testid="email-settings">
      <div className="via-card space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Por onde os e-mails saem</h2>
        </div>
        <RadioGroup value={provider} onValueChange={(v) => setProvider(v as EmailProvider)} className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3" style={{ borderColor: "var(--via-border)" }}>
            <RadioGroupItem value="resend" id="provider-resend" data-testid="email-provider-resend" />
            <span>
              <span className="block text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Resend (e-mail da empresa)</span>
              <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>
                Notificações, automações e sequências saem em nome da empresa, de um domínio seu.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3" style={{ borderColor: "var(--via-border)" }}>
            <RadioGroupItem value="gmail" id="provider-gmail" data-testid="email-provider-gmail" />
            <span>
              <span className="block text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Gmail (conta conectada)</span>
              <span className="block text-xs" style={{ color: "var(--via-text-muted)" }}>
                Tudo sai pela conta do Google de quem conectou. Sem Resend, é a reserva das automações.
              </span>
            </span>
          </label>
        </RadioGroup>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="from_name">Nome do remetente</Label>
            <Input id="from_name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Equipe da Empresa" data-testid="email-from-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="from_email">E-mail do remetente</Label>
            <Input id="from_email" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="contato@suaempresa.com.br" data-testid="email-from-email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reply_to">Responder para (opcional)</Label>
            <Input id="reply_to" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="vendas@suaempresa.com.br" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={salvarRemetente} disabled={salvar.isPending} data-testid="email-save">
            {salvar.isPending ? "Salvando…" : "Salvar configuração"}
          </Button>
          <Button variant="outline" onClick={testar} disabled={enviarTeste.isPending} data-testid="email-send-test">
            <Send className="h-4 w-4" strokeWidth={1.5} />
            {enviarTeste.isPending ? "Enviando…" : "Enviar teste para mim"}
          </Button>
        </div>
      </div>

      <div className="via-card space-y-4 p-5" data-testid="resend-section">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Resend</h2>
          {temChaveResend && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--via-success)" }}>
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} /> Chave salva
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Crie a chave em resend.com e verifique o domínio do remetente lá. A chave fica guardada no cofre da
          organização e nunca volta para a tela.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1 space-y-2">
            <Label htmlFor="resend_key">{temChaveResend ? "Trocar chave" : "Chave de API"}</Label>
            <Input id="resend_key" type="password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="re_..." data-testid="resend-key" />
          </div>
          <Button variant="outline" onClick={salvarChaveResend} disabled={!chave.trim() || salvarChave.isPending}>
            {salvarChave.isPending ? "Salvando…" : "Salvar chave"}
          </Button>
          <ApiKeyTutorialDialog service="resend" />
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={conferirDominio} disabled={!resendPronto || verificarDominio.isPending} data-testid="email-check-domain">
              <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
              {verificarDominio.isPending ? "Consultando…" : "Verificar domínio do remetente"}
            </Button>
            {config?.domain_verified && !dominio && (
              <span className="text-xs" style={{ color: "var(--via-success)" }}>Domínio verificado na última consulta.</span>
            )}
          </div>
          {!resendPronto && (
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              Salve a chave e o e-mail do remetente para verificar o domínio.
            </p>
          )}
          {dominio && (
            <div className="space-y-1 text-xs" data-testid="email-domain-status">
              <p style={{ color: dominio.verified ? "var(--via-success)" : "var(--via-text-body)" }}>
                {dominio.domain}: {dominio.verified ? "verificado" : dominio.found ? `status ${dominio.status}` : "não cadastrado no Resend"}
              </p>
              {!dominio.verified && dominio.records.length > 0 && (
                <ul className="space-y-1">
                  {dominio.records.map((r) => (
                    <li key={`${r.type}-${r.name}`} className="rounded-md border p-2 font-mono" style={{ borderColor: "var(--via-border)" }}>
                      {r.record} {r.type} {r.name} = {r.value} {r.status ? `(${r.status})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="via-card space-y-4 p-5" data-testid="gmail-section">
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>Gmail</h2>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Conta do Google conectada por OAuth. Sincroniza suas conversas no inbox e envia as respostas em seu nome.
        </p>
        <GmailSetup conectado={!!gmail} />
      </div>
    </div>
  );
}
