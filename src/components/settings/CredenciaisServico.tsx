import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useOrgId } from "@/hooks/useOrgId";

/**
 * Bloco padrão de credenciais de um serviço externo (Vault por organização).
 * Vive só em Configurações > Integrações: as telas de uso (Voz, Agenda, Importação)
 * mostram o estado e apontam para cá. O valor nunca volta para a tela; só se sabe
 * se está cadastrado.
 */
export interface CampoCredencial {
  /** Nome do serviço no Vault (ex.: "twilio_account_sid"). */
  service: string;
  label: string;
  secreto?: boolean;
  placeholder?: string;
}

interface Props {
  campos: CampoCredencial[];
  /** Prefixo dos data-testid: `<prefixo>-<service>` e `<prefixo>-salvar`. */
  testIdPrefix: string;
  mensagemSalvo?: string;
}

/** Quais dos serviços já têm chave ativa na organização (uma consulta só). */
export function useCredenciaisCadastradas(services: string[]) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org-api-keys-lote", orgId, ...services],
    enabled: !!orgId && services.length > 0,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await supabase.from("api_keys_registry").select("service_name, is_active").eq("org_id", orgId!).in("service_name", services);
      if (error) throw error;
      const ativos = new Set((data ?? []).filter((r) => r.is_active !== false).map((r) => r.service_name));
      return Object.fromEntries(services.map((s) => [s, ativos.has(s)]));
    },
  });
}

/** Estado "todas cadastradas" de um conjunto de serviços, para o status do card. */
export function useCredenciaisProntas(services: string[]): boolean {
  const { data } = useCredenciaisCadastradas(services);
  return !!data && services.every((s) => data[s]);
}

export function CredenciaisServico({ campos, testIdPrefix, mensagemSalvo = "Credenciais salvas." }: Props) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const services = campos.map((c) => c.service);
  const { data: cadastradas } = useCredenciaisCadastradas(services);
  const [valores, setValores] = useState<Record<string, string>>({});
  const algumPreenchido = campos.some((c) => (valores[c.service] ?? "").trim());

  const salvar = useMutation({
    mutationFn: async () => {
      for (const c of campos) {
        const chave = (valores[c.service] ?? "").trim();
        if (!chave) continue;
        const { data, error } = await supabase.functions.invoke("store-api-key", { body: { service_name: c.service, api_key: chave, label: c.service } });
        if (error) throw new Error((await erroDeFunction(error, `Falha ao salvar ${c.label}.`)).message);
        if (!data?.success) throw new Error(data?.error ?? `Falha ao salvar ${c.label}.`);
      }
    },
    onSuccess: () => {
      setValores({});
      queryClient.invalidateQueries({ queryKey: ["org-api-keys-lote", orgId] });
      queryClient.invalidateQueries({ queryKey: ["org-api-key", orgId] });
      queryClient.invalidateQueries({ queryKey: ["voice-status", orgId] });
      toast.success(mensagemSalvo);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {campos.map((c) => {
          const cadastrada = !!cadastradas?.[c.service];
          const id = `cred-${c.service}`;
          return (
            <div key={c.service} className="space-y-1">
              <Label htmlFor={id}>
                {c.label} {cadastrada && <span style={{ color: "var(--via-success)" }}>(cadastrada)</span>}
              </Label>
              <Input
                id={id}
                type={c.secreto ? "password" : "text"}
                value={valores[c.service] ?? ""}
                onChange={(e) => setValores({ ...valores, [c.service]: e.target.value })}
                placeholder={cadastrada ? "••••••••  (deixe vazio para manter)" : c.placeholder}
                autoComplete="off"
                data-testid={`${testIdPrefix}-${c.service}`}
              />
            </div>
          );
        })}
      </div>
      <Button size="sm" variant="outline" onClick={() => salvar.mutate()} disabled={!algumPreenchido || salvar.isPending} data-testid={`${testIdPrefix}-salvar`}>
        {salvar.isPending ? "Salvando…" : "Salvar credenciais"}
      </Button>
    </div>
  );
}
