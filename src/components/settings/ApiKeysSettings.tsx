import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Eye, EyeOff, Plus, ExternalLink, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import { API_KEY_TUTORIALS, tutorialDoServico } from "@/lib/apiKeyTutorials";

interface RegistryRow { service_name: string; label: string | null; is_active: boolean | null; }
interface Status { [service: string]: "valid" | "invalid" | "unconfigured" | "checking"; }

// Catálogo e tutoriais moram em src/lib/apiKeyTutorials.ts — assim o copy é
// editável sem tocar neste componente e é reaproveitado no onboarding.
const TUTORIAL_LINKS = API_KEY_TUTORIALS;
const tutorialFor = tutorialDoServico;

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
    if (error) { toast.error((await erroDeFunction(error, "Falha ao salvar chave.")).message); return; }
    if (!data?.success) { toast.error(data?.error ?? "Falha ao salvar chave."); return; }
    toast.success("Chave armazenada com segurança");
    setOpen(false);
    load();
  };

  const remove = async (s: string) => {
    const { error } = await supabase.functions.invoke("delete-api-key", { body: { service_name: s } });
    if (error) { toast.error((await erroDeFunction(error, "Falha ao remover a chave.")).message); return; }
    toast.success("Chave removida");
    setConfirmDel(null);
    load();
  };

  const test = async (s: string) => {
    const anterior = status[s];
    setStatus((p) => ({ ...p, [s]: "checking" }));
    const { data, error } = await supabase.functions.invoke("validate-api-key", { body: { service_name: s } });

    // Falha da function não é veredito sobre a chave. Marcar "invalid" aqui
    // afirmava que a chave do usuário estava errada quando o que quebrou foi a
    // validação — então o status anterior é restaurado e o erro real aparece.
    if (error) {
      setStatus((p) => ({ ...p, [s]: anterior }));
      toast.error((await erroDeFunction(error, "Não foi possível validar a chave.")).message);
      return;
    }

    setStatus((p) => ({ ...p, [s]: (data?.status as Status[string]) ?? "invalid" }));
    if (data?.status === "valid") toast.success("Chave válida");
    else toast.error("Chave inválida");
  };

  return (
    <div className="space-y-4">
      {/* O cabeçalho (propósito, relevância e status) fica no card colapsável
          da aba — aqui só a ação e a lista. */}
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova chave</Button>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <p>
              Aqui ficam as chaves de serviços externos <strong>opcionais</strong>, que ligam
              recursos extras à plataforma.
            </p>
            <ul className="mx-auto mt-3 max-w-md space-y-1 text-left">
              <li>· <strong>ElevenLabs</strong> — a agente ouve áudios e responde com voz.</li>
              <li>· <strong>Resend</strong> ou <strong>SendGrid</strong> — envio de e-mails pelas campanhas e sequências.</li>
              <li>· <strong>Stripe</strong> — cobranças e pagamentos.</li>
            </ul>
            <p className="mt-3">
              O atendimento por texto funciona sem nenhuma chave aqui.
            </p>
          </CardContent>
        </Card>
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
          <DialogHeader>
            <DialogTitle>{editing ? "Alterar chave" : "Nova chave"}</DialogTitle>
            <DialogDescription>
              A chave é guardada no Vault do Supabase e nunca volta para a tela depois de salva.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key-service">Serviço</Label>
              <Input id="api-key-service" value={serviceName} onChange={(e) => setServiceName(e.target.value)} disabled={!!editing} placeholder="ex: openai" />
              {/* Antes o campo era "adivinhe o nome exato do serviço". O catálogo
                  de tutoriais já existia no arquivo — agora ele também sugere. */}
              {!editing && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Object.entries(TUTORIAL_LINKS).map(([key, tip]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setServiceName(key)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        serviceName === key ? "border-primary bg-muted" : "border-border hover:bg-muted"
                      }`}
                      data-testid="api-key-suggestion"
                    >
                      {tip.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key-value">Chave de API</Label>
              <div className="relative">
                <Input id="api-key-value" type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Ocultar a chave" : "Mostrar a chave"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {(() => {
              const tip = tutorialFor(serviceName);
              if (!tip) return null;
              return (
                <div className="flex flex-wrap items-center gap-4">
                  <ApiKeyTutorialDialog service={serviceName} />
                  <a href={tip.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> Como obter a chave de {tip.label}
                  </a>
                </div>
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
