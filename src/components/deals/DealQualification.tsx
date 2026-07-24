import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_QUALIFICATION, useUpdateDeal, type Deal, type Qualification,
} from "@/hooks/useDeals";

/** Campos BANT na ordem canônica. */
const BANT: { key: keyof Qualification; label: string; hint: string }[] = [
  { key: "budget", label: "Budget (orçamento)", hint: "Há verba? Quanto? Quem controla o orçamento?" },
  { key: "authority", label: "Authority (autoridade)", hint: "Quem decide? O contato é o decisor ou influencia?" },
  { key: "need", label: "Need (necessidade)", hint: "Qual dor o produto resolve? Quão urgente é?" },
  { key: "timeline", label: "Timeline (prazo)", hint: "Quando pretende decidir/implementar?" },
];

/** Lê a qualificação do deal tolerando JSON legado/incompleto. */
function readQualification(deal: Deal): Qualification {
  const raw = (deal.qualification ?? {}) as Partial<Record<keyof Qualification, unknown>>;
  return {
    budget: typeof raw.budget === "string" ? raw.budget : null,
    authority: typeof raw.authority === "string" ? raw.authority : null,
    need: typeof raw.need === "string" ? raw.need : null,
    timeline: typeof raw.timeline === "string" ? raw.timeline : null,
  };
}

export function DealQualification({ deal }: { deal: Deal }) {
  const updateDeal = useUpdateDeal();
  const [form, setForm] = useState<Qualification>(EMPTY_QUALIFICATION);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm(readQualification(deal));
    setDirty(false);
  }, [deal]);

  const handleSave = async () => {
    try {
      // Strings vazias viram null para não poluir o JSON.
      const cleaned: Qualification = {
        budget: form.budget?.trim() || null,
        authority: form.authority?.trim() || null,
        need: form.need?.trim() || null,
        timeline: form.timeline?.trim() || null,
      };
      await updateDeal.mutateAsync({ id: deal.id, qualification: cleaned as unknown as never });
      setDirty(false);
      toast.success("Qualificação salva.");
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível salvar: ${error.message}` : "Não foi possível salvar a qualificação.",
      );
    }
  };

  return (
    <div className="via-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
          Qualificação BANT
        </h2>
      </div>

      <div className="space-y-4">
        {BANT.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`bant-${key}`}>{label}</Label>
            <Textarea
              id={`bant-${key}`}
              rows={2}
              placeholder={hint}
              value={form[key] ?? ""}
              onChange={(e) => {
                setForm({ ...form, [key]: e.target.value });
                setDirty(true);
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={handleSave} disabled={!dirty || updateDeal.isPending}>
          {updateDeal.isPending ? "Salvando…" : "Salvar qualificação"}
        </Button>
      </div>
    </div>
  );
}
