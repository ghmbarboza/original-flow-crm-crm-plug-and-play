import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MelhorarComIA } from "@/components/ai/MelhorarComIA";
import { BRAND_TONES, useOrganization, useSaveSetupStep } from "@/hooks/useSetup";
import { PularEtapa } from "@/components/setup/PularEtapa";

export function StepPublico({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data: org } = useOrganization();
  const salvar = useSaveSetupStep();

  const [form, setForm] = useState({
    target_audience: "",
    brand_tone: "profissional",
    ai_prohibitions: "",
    good_response_example: "",
  });

  // Hidrata UMA vez. Sem a trava, cada refetch da organização sobrescrevia o
  // formulário com os valores do servidor e apagava o que o usuário estava
  // digitando: o passo anterior invalida a query, então há um refetch em voo
  // justamente enquanto esta tela é preenchida.
  const hidratado = useRef(false);
  useEffect(() => {
    if (!org || hidratado.current) return;
    hidratado.current = true;
    setForm({
      target_audience: org.target_audience ?? "",
      brand_tone: org.brand_tone ?? "profissional",
      ai_prohibitions: org.ai_prohibitions ?? "",
      good_response_example: org.good_response_example ?? "",
    });
  }, [org]);

  const podeAvancar =
    form.target_audience.trim().length > 0 &&
    form.target_audience.length <= 200 &&
    !!form.brand_tone;

  const avancar = async () => {
    try {
      await salvar.mutateAsync({
        step: "publico",
        patch: {
          target_audience: form.target_audience.trim(),
          brand_tone: form.brand_tone,
          ai_prohibitions: form.ai_prohibitions.trim() || null,
          good_response_example: form.good_response_example.trim() || null,
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
          Público e tom de voz
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Quanto mais específico aqui, menos genérica a IA soa.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="audience">Para quem você vende?</Label>
          <MelhorarComIA
            valor={form.target_audience}
            onChange={(t) => setForm((f) => ({ ...f, target_audience: t }))}
            contexto="o público para quem a empresa vende (perfil, faixa de renda, momento de compra)"
            maxChars={200}
            data-testid="melhorar-publico"
          />
        </div>
        <Textarea
          id="audience"
          data-testid="setup-audience"
          rows={3}
          maxLength={200}
          value={form.target_audience}
          onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
          placeholder="Ex.: Casais entre 30 e 45 anos buscando o primeiro imóvel, com renda familiar entre R$ 8 mil e R$ 15 mil."
        />
      </div>

      <div className="space-y-2">
        <Label>Como sua empresa se comunica?</Label>
        {/* Cada tom vem com uma frase de exemplo: nomear o tom é abstrato,
            mas ler a frase deixa óbvio qual é o da casa. */}
        <div className="grid gap-2">
          {BRAND_TONES.map((t) => {
            const ativo = form.brand_tone === t.value;
            return (
              <button
                key={t.value}
                type="button"
                data-testid="setup-tone"
                data-tone={t.value}
                onClick={() => setForm({ ...form, brand_tone: t.value })}
                className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors"
                style={{
                  borderColor: ativo ? "var(--via-navy)" : "var(--via-border)",
                  background: ativo ? "var(--via-surface)" : "transparent",
                }}
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                  style={{ borderColor: ativo ? "var(--via-navy)" : "var(--via-border)" }}
                >
                  {ativo && <Check className="h-3 w-3" strokeWidth={2.5} style={{ color: "var(--via-navy)" }} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                    {t.label}
                  </span>
                  <span className="block text-sm italic" style={{ color: "var(--via-text-muted)" }}>
                    “{t.exemplo}”
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prohibitions">O que sua IA nunca deve fazer ou dizer? (opcional)</Label>
        <Textarea
          id="prohibitions"
          data-testid="setup-prohibitions"
          rows={3}
          maxLength={300}
          value={form.ai_prohibitions}
          onChange={(e) => setForm({ ...form, ai_prohibitions: e.target.value })}
          placeholder="Ex.: Nunca prometer desconto sem aprovação do gerente. Nunca citar concorrentes pelo nome."
        />
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Isso vira uma lista de proibições no comportamento da IA.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="example">Um exemplo de resposta que você considera ideal (opcional)</Label>
        <Textarea
          id="example"
          data-testid="setup-example"
          rows={3}
          maxLength={500}
          value={form.good_response_example}
          onChange={(e) => setForm({ ...form, good_response_example: e.target.value })}
          placeholder="Cole uma mensagem que sua equipe enviaria e que representa bem o tom da empresa."
        />
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          A IA aprende com exemplos concretos — isso reduz respostas fora do perfil.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button variant="outline" onClick={onBack}>Voltar</Button>
        <PularEtapa
          step="publico"
          impacto="Sem esse contexto, a IA responde de forma genérica. Você completa depois em Configurações > IA."
          onPulado={onNext}
          disabled={salvar.isPending}
        >
          <Button onClick={avancar} disabled={!podeAvancar || salvar.isPending} data-testid="setup-next">
            {salvar.isPending ? "Salvando…" : "Avançar"}
          </Button>
        </PularEtapa>
      </div>
    </div>
  );
}
