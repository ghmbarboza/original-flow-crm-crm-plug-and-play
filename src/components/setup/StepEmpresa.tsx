import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BUSINESS_SECTORS, COMPANY_SIZES, useOrganization, useSaveSetupStep } from "@/hooks/useSetup";

/** Contador de caracteres que fica vermelho ao estourar o limite. */
function Contador({ atual, max }: { atual: number; max: number }) {
  return (
    <span
      className="text-xs tabular-nums"
      style={{ color: atual > max ? "var(--via-coral, #dc2626)" : "var(--via-text-muted)" }}
    >
      {atual}/{max}
    </span>
  );
}

export function StepEmpresa({ onNext, onBack }: { onNext: () => void; onBack?: () => void }) {
  const { data: org } = useOrganization();
  const salvar = useSaveSetupStep();

  const [form, setForm] = useState({
    name: "",
    business_sector: "",
    company_size: "",
    business_description: "",
    main_problem_solved: "",
  });

  // Hidrata UMA vez — ver a mesma trava em StepPublico. Um refetch da
  // organização no meio da digitação reverteria o formulário para o servidor.
  const hidratado = useRef(false);
  useEffect(() => {
    if (!org || hidratado.current) return;
    hidratado.current = true;
    setForm({
      name: org.name ?? "",
      business_sector: org.business_sector ?? "",
      company_size: org.company_size ?? "",
      business_description: org.business_description ?? "",
      main_problem_solved: org.main_problem_solved ?? "",
    });
  }, [org]);

  const podeAvancar =
    form.name.trim().length > 0 &&
    !!form.business_sector &&
    form.business_description.trim().length > 0 &&
    form.business_description.length <= 300 &&
    form.main_problem_solved.trim().length > 0 &&
    form.main_problem_solved.length <= 200;

  const avancar = async () => {
    try {
      await salvar.mutateAsync({
        step: "empresa",
        patch: {
          name: form.name.trim(),
          business_sector: form.business_sector,
          company_size: form.company_size || null,
          business_description: form.business_description.trim(),
          main_problem_solved: form.main_problem_solved.trim(),
        },
      });
      onNext();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          Sobre a sua empresa
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Estas respostas definem como sua IA vai se apresentar e o que vai oferecer.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="org-name">Nome da empresa</Label>
        <Input
          id="org-name"
          data-testid="setup-org-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label>Setor de atuação</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BUSINESS_SECTORS.map((s) => {
            const ativo = form.business_sector === s.value;
            return (
              <button
                key={s.value}
                type="button"
                data-testid="setup-sector"
                data-sector={s.value}
                onClick={() => setForm({ ...form, business_sector: s.value })}
                className="flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors"
                style={{
                  borderColor: ativo ? "var(--via-navy)" : "var(--via-border)",
                  background: ativo ? "var(--via-surface)" : "transparent",
                  color: "var(--via-text-primary)",
                }}
              >
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Tamanho da equipe (opcional)</Label>
        <div className="flex flex-wrap gap-2">
          {COMPANY_SIZES.map((t) => {
            const ativo = form.company_size === t.value;
            return (
              <button
                key={t.value}
                type="button"
                data-testid="setup-company-size"
                data-size={t.value}
                onClick={() => setForm({ ...form, company_size: ativo ? "" : t.value })}
                className="rounded-full border px-3 py-1.5 text-sm transition-colors"
                style={{
                  borderColor: ativo ? "var(--via-navy)" : "var(--via-border)",
                  background: ativo ? "var(--via-surface)" : "transparent",
                  color: "var(--via-text-primary)",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="org-desc">O que sua empresa vende e para quem?</Label>
          <Contador atual={form.business_description.length} max={300} />
        </div>
        <Textarea
          id="org-desc"
          data-testid="setup-description"
          rows={3}
          value={form.business_description}
          onChange={(e) => setForm({ ...form, business_description: e.target.value })}
          placeholder="Ex.: Vendemos software de gestão para pequenas clínicas odontológicas."
        />
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Isso define como sua IA vai se apresentar e o que vai oferecer.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="org-problem">Qual problema você resolve para seu cliente?</Label>
          <Contador atual={form.main_problem_solved.length} max={200} />
        </div>
        <Textarea
          id="org-problem"
          data-testid="setup-problem"
          rows={3}
          value={form.main_problem_solved}
          onChange={(e) => setForm({ ...form, main_problem_solved: e.target.value })}
          placeholder="Ex.: O cliente passa horas pesquisando sem saber se cabe no orçamento. Resolvemos qualificando antes de mostrar opções."
        />
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          A IA usa isso para focar nas dores certas.
        </p>
      </div>

      <div className={onBack ? "flex justify-between" : "flex justify-end"}>
        {onBack && <Button variant="outline" onClick={onBack}>Voltar</Button>}
        <Button onClick={avancar} disabled={!podeAvancar || salvar.isPending} data-testid="setup-next">
          {salvar.isPending ? "Salvando…" : "Avançar"}
        </Button>
      </div>
    </div>
  );
}
