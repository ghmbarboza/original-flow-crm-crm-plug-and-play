import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Eye, EyeOff, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface RegistryRow { service_name: string; label: string | null; is_active: boolean | null; }
interface Status { [service: string]: "valid" | "invalid" | "unconfigured" | "checking"; }

const TUTORIAL_LINKS: Record<string, { label: string; url: string }> = {
  openai: { label: "OpenAI", url: "https://platform.openai.com/docs/api-reference/authentication" },
  anthropic: { label: "Anthropic", url: "https://docs.anthropic.com/en/api/getting-started" },
  google: { label: "Google AI", url: "https://ai.google.dev/gemini-api/docs/api-key" },
  gemini: { label: "Google Gemini", url: "https://ai.google.dev/gemini-api/docs/api-key" },
  perplexity: { label: "Perplexity", url: "https://docs.perplexity.ai/guides/getting-started" },
  groq: { label: "Groq", url: "https://console.groq.com/docs/quickstart" },
  mistral: { label: "Mistral", url: "https://docs.mistral.ai/getting-started/quickstart/" },
  cohere: { label: "Cohere", url: "https://docs.cohere.com/docs/the-cohere-platform" },
  stripe: { label: "Stripe", url: "https://docs.stripe.com/keys" },
  resend: { label: "Resend", url: "https://resend.com/docs/dashboard/api-keys/introduction" },
  sendgrid: { label: "SendGrid", url: "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys" },
  twilio: { label: "Twilio", url: "https://www.twilio.com/docs/iam/api-keys" },
  pipedrive: { label: "Pipedrive", url: "https://pipedrive.readme.io/docs/how-to-find-the-api-token" },
  hubspot: { label: "HubSpot", url: "https://developers.hubspot.com/docs/api/private-apps" },
};

const tutorialFor = (name: string) => {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (TUTORIAL_LINKS[key]) return TUTORIAL_LINKS[key];
  const partial = Object.keys(TUTORIAL_LINKS).find((k) => key.includes(k));
  return partial ? TUTORIAL_LINKS[partial] : { label: name, url: `https://www.google.com/search?q=${encodeURIComponent(`${name} API key documentation`)}` };
};

export default function ApiKeysSettings() {
  const [services, setServices] = useState<RegistryRow[]>([]);
  const [status, setStatus] = useState<Status>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("api_keys_registry").select("service_name, label, is_active");
    setServices(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setServiceName(""); setApiKey(""); setShowKey(false); setOpen(true); };
  const openEdit = (s: string) => { setEditing(s); setServiceName(s); setApiKey(""); setShowKey(false); setOpen(true); };

  const save = async () => {
    const sn = serviceName.trim();
    if (!sn || !apiKey) { toast.error("Preencha serviço e chave"); return; }
    const { data, error } = await supabase.functions.invoke("store-api-key", {
      body: { service_name: sn, api_key: apiKey, label: sn },
    });
    setApiKey(""); // clear immediately
    if (error || !data?.success) { toast.error("Falha ao salvar chave"); return; }
    toast.success("Chave armazenada com segurança");
    setOpen(false);
    load();
  };

  const remove = async (s: string) => {
    const { error } = await supabase.functions.invoke("delete-api-key", { body: { service_name: s } });
    if (error) { toast.error("Falha ao remover"); return; }
    toast.success("Chave removida");
    setConfirmDel(null);
    load();
  };

  const test = async (s: string) => {
    setStatus((p) => ({ ...p, [s]: "checking" }));
    const { data } = await supabase.functions.invoke("validate-api-key", { body: { service_name: s } });
    setStatus((p) => ({ ...p, [s]: (data?.status as any) ?? "invalid" }));
    if (data?.status === "valid") toast.success("Chave válida");
    else toast.error("Chave inválida");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end items-center">
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova chave</Button>
      </div>


      {services.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma chave configurada.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((s) => {
            const st = status[s.service_name];
            return (
              <Card key={s.service_name}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{s.label ?? s.service_name}</span>
                    {st === "valid" ? <Badge className="bg-success text-success-foreground">Ativa</Badge>
                      : st === "invalid" ? <Badge variant="destructive">Inválida</Badge>
                      : <Badge variant="secondary">Não verificada</Badge>}
                  </CardTitle>
                  <CardDescription>{s.service_name}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s.service_name)}>Alterar chave</Button>
                  <Button size="sm" variant="outline" onClick={() => test(s.service_name)}>Testar conexão</Button>
                  <Button size="sm" variant="destructive" onClick={() => setConfirmDel(s.service_name)}>Remover</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Alterar chave" : "Nova chave"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Serviço</Label>
              <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} disabled={!!editing} placeholder="ex: openai" />
            </div>
            <div className="space-y-2">
              <Label>Chave de API</Label>
              <div className="relative">
                <Input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {(() => {
              const tip = tutorialFor(serviceName);
              if (!tip) return null;
              return (
                <a href={tip.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Como obter a chave de {tip.label}
                </a>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover chave?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. A chave será removida do Vault.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && remove(confirmDel)}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
