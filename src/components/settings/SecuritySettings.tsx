import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";

const DOMAIN_REGEX = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

export default function SecuritySettings() {
  const [requireApproval, setRequireApproval] = useState(false);
  const [restrictDomain, setRestrictDomain] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("project_config").select("key, value");
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
      setRequireApproval(map.require_account_approval === "true");
      setRestrictDomain(map.restrict_signup_by_domain === "true");
      setDomains((map.allowed_email_domains ?? "").split(",").map((d) => d.trim()).filter(Boolean));
      setLoading(false);
    })();
  }, []);

  const updateConfig = async (key: string, value: string) => {
    const { error } = await supabase.from("project_config").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    if (error) { toast.error(error.message); return false; }
    return true;
  };

  const onToggleApproval = async (val: boolean) => {
    setRequireApproval(val);
    if (await updateConfig("require_account_approval", val ? "true" : "false")) toast.success("Atualizado");
  };

  const onToggleDomain = async (val: boolean) => {
    setRestrictDomain(val);
    if (await updateConfig("restrict_signup_by_domain", val ? "true" : "false")) toast.success("Atualizado");
  };

  const addDomain = async () => {
    const d = newDomain.trim().toLowerCase();
    if (!DOMAIN_REGEX.test(d)) { toast.error("Domínio inválido"); return; }
    if (domains.includes(d)) { toast.error("Já adicionado"); return; }
    const next = [...domains, d];
    if (await updateConfig("allowed_email_domains", next.join(","))) {
      setDomains(next); setNewDomain(""); toast.success("Domínio adicionado");
    }
  };

  const removeDomain = async (d: string) => {
    const next = domains.filter((x) => x !== d);
    if (await updateConfig("allowed_email_domains", next.join(","))) {
      setDomains(next); toast.success("Removido");
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold">Exigir aprovação para novas contas</CardTitle>
              <CardDescription className="text-sm">
                Quando ativo, novos usuários precisarão ser aprovados por um administrador antes de acessar a plataforma.
              </CardDescription>
            </div>
            <Switch checked={requireApproval} onCheckedChange={onToggleApproval} />
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              O primeiro usuário cadastrado (administrador) é sempre aprovado automaticamente.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base font-semibold">Restringir cadastro por domínio de email</CardTitle>
              <CardDescription className="text-sm">Apenas emails com os domínios listados poderão se cadastrar.</CardDescription>
            </div>
            <Switch checked={restrictDomain} onCheckedChange={onToggleDomain} />
          </div>
        </CardHeader>
        {restrictDomain && (
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="empresa.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
              <Button onClick={addDomain}>Adicionar</Button>
            </div>
            {domains.length === 0 ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Atenção: nenhum domínio configurado. Nenhum novo cadastro será permitido.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-wrap gap-2">
                {domains.map((d) => (
                  <Badge key={d} variant="secondary" className="gap-1">
                    {d}
                    <button onClick={() => removeDomain(d)} aria-label={`Remover ${d}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
