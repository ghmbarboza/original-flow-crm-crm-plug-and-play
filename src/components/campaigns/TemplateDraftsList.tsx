import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";
import { useDeleteTemplateDraft, useSubmitTemplateDraft, useWhatsappTemplateDrafts, type WhatsappTemplateDraft } from "@/hooks/useWhatsappTemplateDrafts";

const STATUS: Record<string, string> = { draft: "Rascunho", submitted: "Enviado para aprovação", error: "Falhou" };

/**
 * Campanhas > Templates > Rascunhos: templates do kit inicial no formato da
 * Meta, prontos para enviar quando a org tiver a API oficial conectada.
 */
export function TemplateDraftsList() {
  const { data: drafts } = useWhatsappTemplateDrafts();
  const enviar = useSubmitTemplateDraft();
  const apagar = useDeleteTemplateDraft();
  const { data: canal } = useWhatsAppSetup();
  const oficial = !!canal?.configured && (canal.provider === "meta_official" || canal.provider === "zernio");

  if (!drafts || drafts.length === 0) return null;

  const submeter = async (d: WhatsappTemplateDraft) => {
    try {
      await enviar.mutateAsync(d);
      toast.success(`Template "${d.name}" enviado para aprovação.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
    }
  };

  return (
    <div className="via-card space-y-3 p-4" data-testid="template-drafts">
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Rascunhos do kit inicial</p>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Já no formato da Meta (variáveis numeradas e exemplos). {oficial ? "Envie para aprovação quando quiser." : "Conecte a API oficial da Meta ou o Zernio para enviar para aprovação."}
        </p>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--via-border)" }}>
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-start gap-3 py-3" data-testid={`template-draft-${d.name}`}>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm" style={{ color: "var(--via-text-primary)" }}>{d.name} <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>{d.category} · {d.language} · {STATUS[d.status] ?? d.status}</span></p>
              <p className="whitespace-pre-wrap text-xs" style={{ color: "var(--via-text-body)" }}>{d.body_text}</p>
              {d.error && <p className="text-xs" style={{ color: "var(--via-coral, #e0553f)" }}>{d.error}</p>}
            </div>
            {d.status !== "submitted" && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => submeter(d)} disabled={!oficial || enviar.isPending}>
                <Send className="h-4 w-4" strokeWidth={1.5} />
                Enviar para aprovação
              </Button>
            )}
            <Button size="icon" variant="ghost" aria-label="Apagar rascunho" onClick={() => apagar.mutate(d.id)}>
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
