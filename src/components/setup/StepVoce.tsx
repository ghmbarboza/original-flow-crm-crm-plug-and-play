import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useSaveSetupStep } from "@/hooks/useSetup";
import { PularEtapa } from "@/components/setup/PularEtapa";

/**
 * Etapa "Você": nome e telefone de quem está configurando.
 *
 * Fonte única com Configurações > Geral > Informações pessoais: os DOIS leem
 * e gravam em `profiles` — refazer o onboarding mostra o que está no banco, e
 * editar em Configurações reflete aqui. Nada é pedido duas vezes.
 */
export function StepVoce({ onNext }: { onNext: () => void }) {
  const { user, profile, refreshProfile } = useAuth();
  const salvarEtapa = useSaveSetupStep();
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({ full_name: "", phone: "" });

  // Hidrata UMA vez (mesma trava dos outros passos): refetch do profile no
  // meio da digitação não pode reverter o formulário.
  const hidratado = useRef(false);
  useEffect(() => {
    if (!profile || hidratado.current) return;
    hidratado.current = true;
    setForm({
      full_name: profile.full_name ?? "",
      phone: profile.phone ?? "",
    });
  }, [profile]);

  const podeAvancar = form.full_name.trim().length > 0;

  const avancar = async () => {
    if (!user) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      await salvarEtapa.mutateAsync({ step: "voce" });
      onNext();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          Sobre você
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Como devemos te chamar? Esses dados ficam no seu perfil e você pode
          mudá-los em Configurações &gt; Geral.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="voce-nome">Seu nome completo</Label>
        <Input
          id="voce-nome"
          data-testid="setup-voce-nome"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          maxLength={120}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="voce-telefone">Seu telefone (opcional)</Label>
        <Input
          id="voce-telefone"
          data-testid="setup-voce-telefone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="(11) 99999-9999"
          maxLength={30}
        />
      </div>

      <div className="flex flex-wrap items-end justify-end gap-3">
        <PularEtapa
          step="voce"
          impacto="Sem seu nome, as mensagens internas e notificações ficam impessoais. Você completa depois em Configurações > Geral."
          onPulado={onNext}
          disabled={salvando}
        >
          <Button onClick={avancar} disabled={!podeAvancar || salvando} data-testid="setup-next">
            {salvando ? "Salvando…" : "Avançar"}
          </Button>
        </PularEtapa>
      </div>
    </div>
  );
}
