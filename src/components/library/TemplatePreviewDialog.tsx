import { useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  aplicarContexto, lerConteudo, rotuloCategoria, rotuloSubcategoria, useOrgTemplateContext,
  type LibraryTemplate, type OrgTemplateContext,
} from "@/hooks/useLibraryTemplates";

/** Etapa do preview: cabeçalho com o prazo e um corpo truncável. */
function Etapa({
  titulo, quando, assunto, corpo,
}: { titulo: string; quando: string; assunto?: string; corpo: string }) {
  const [aberto, setAberto] = useState(false);
  const longo = corpo.length > 220;
  const texto = aberto || !longo ? corpo : `${corpo.slice(0, 220)}…`;

  return (
    <div className="space-y-1 border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "var(--via-border, #00000015)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
        {titulo} — {quando}
      </p>
      {assunto && (
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          <span style={{ color: "var(--via-text-muted)" }}>Assunto: </span>{assunto}
        </p>
      )}
      <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--via-text-body)" }}>{texto}</p>
      {longo && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="text-xs underline"
          style={{ color: "var(--via-text-muted)" }}
        >
          {aberto ? "Ver menos" : "Ver completo"}
        </button>
      )}
    </div>
  );
}

function prazoEmDias(dias: number): string {
  if (dias === 0) return "imediato";
  return dias === 1 ? "1 dia depois" : `${dias} dias depois`;
}

function prazoEmHoras(horas: number): string {
  if (horas < 24) return horas === 1 ? "1 hora depois" : `${horas} horas depois`;
  const d = Math.round(horas / 24);
  return d === 1 ? "1 dia depois" : `${d} dias depois`;
}

/** Corpo do preview, por categoria — com as variáveis já preenchidas. */
function Conteudo({ template, ctx }: { template: LibraryTemplate; ctx: Partial<OrgTemplateContext> }) {
  let c: ReturnType<typeof lerConteudo>;
  try {
    const bruto = lerConteudo(template);
    // O usuário vê o modelo como ele vai ficar NA EMPRESA DELE: {{company}},
    // {{sector}}, {{product}} e {{tone}} entram preenchidos antes de confirmar.
    // A substituição roda sobre o JSON serializado (cobre todas as formas de
    // conteúdo de uma vez), com os valores escapados para não quebrar o parse.
    const ctxEscapado = Object.fromEntries(
      Object.entries(ctx).map(([k, v]) => [k, v ? JSON.stringify(v).slice(1, -1) : v]),
    );
    c = JSON.parse(
      aplicarContexto(JSON.stringify(bruto), ctxEscapado),
    ) as ReturnType<typeof lerConteudo>;
  } catch (e) {
    return (
      <p className="flex items-center gap-2 text-sm" style={{ color: "var(--via-coral, #dc2626)" }}>
        <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
        {e instanceof Error ? e.message : "Modelo inválido."}
      </p>
    );
  }

  switch (c.tipo) {
    case "email_sequence":
      return (
        <div className="space-y-3">
          {[...c.steps].sort((a, b) => a.order - b.order).map((p, i) => (
            <Etapa key={i} titulo={`Etapa ${i + 1}`} quando={prazoEmDias(p.delay_days)}
              assunto={p.subject} corpo={p.body} />
          ))}
        </div>
      );
    case "email_template":
      return <Etapa titulo="Email" quando="modelo único" assunto={c.subject} corpo={c.body} />;
    case "followup":
      return (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            {c.steps.length} tentativa(s) · até {c.max_attempts} no total
          </p>
          {[...c.steps].sort((a, b) => a.order - b.order).map((p, i) => (
            <Etapa key={i} titulo={`Tentativa ${i + 1}`} quando={prazoEmHoras(p.delay_hours)} corpo={p.message} />
          ))}
        </div>
      );
    case "automation": {
      const gatilho = c.trigger as { label?: string; type?: string };
      const acoes = (c.actions ?? []) as { label?: string; type?: string }[];
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Quando</p>
            <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
              {gatilho?.label ?? gatilho?.type ?? "gatilho não descrito"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Então</p>
            <ul className="list-disc pl-5 text-sm" style={{ color: "var(--via-text-body)" }}>
              {acoes.map((a, i) => <li key={i}>{a?.label ?? a?.type ?? "ação"}</li>)}
            </ul>
          </div>
        </div>
      );
    }
    case "ai_faq":
      return (
        <div className="space-y-3">
          {c.faqs.map((f, i) => <Etapa key={i} titulo={`Pergunta ${i + 1}`} quando={f.question} corpo={f.answer} />)}
        </div>
      );
    case "ai_objection":
      return (
        <div className="space-y-3">
          {c.objections.map((o, i) => <Etapa key={i} titulo={`Objeção ${i + 1}`} quando={o.objection} corpo={o.response} />)}
        </div>
      );
  }
}

export function TemplatePreviewDialog({
  template, onOpenChange, onUsar, ativando,
}: {
  template: LibraryTemplate | null;
  onOpenChange: (open: boolean) => void;
  onUsar: (t: LibraryTemplate) => void;
  ativando: boolean;
}) {
  const { data: ctx } = useOrgTemplateContext();
  // Follow-up é único por org: ativar substitui a cadência atual. Avisar antes é
  // obrigatório — as outras categorias só acrescentam.
  const substitui = template?.category === "followup";

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden" data-testid="library-preview">
        {template && (
          <>
            <DialogHeader>
              <DialogTitle>{template.title}</DialogTitle>
              <DialogDescription>
                {rotuloCategoria(template.category)} · {rotuloSubcategoria(template.subcategory)}
              </DialogDescription>
            </DialogHeader>

            <div className="via-scroll max-h-[52vh] space-y-4 overflow-y-auto pr-1">
              <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{template.description}</p>
              {(ctx?.company || ctx?.sector || ctx?.product) && (
                <p className="text-xs" style={{ color: "var(--via-text-muted)" }} data-testid="library-contexto-aviso">
                  Pré-visualização com os dados da sua empresa — as variáveis do modelo já
                  aparecem preenchidas e a cópia ativada nasce assim.
                </p>
              )}
              <Conteudo template={template} ctx={ctx ?? {}} />
            </div>

            {substitui && (
              <p
                className="flex items-start gap-2 rounded p-3 text-sm"
                style={{ background: "var(--via-surface-2, #00000008)", color: "var(--via-text-body)" }}
                data-testid="library-aviso-substitui"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
                A configuração de follow-up é única por organização. Ativar este modelo
                substitui a cadência de tentativas atual.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={ativando}>
                Cancelar
              </Button>
              <Button
                className="gap-1.5"
                onClick={() => onUsar(template)}
                disabled={ativando}
                data-testid="library-usar"
              >
                {ativando ? "Ativando…" : "Usar este modelo"}
                {!ativando && <ArrowRight className="h-4 w-4" strokeWidth={1.5} />}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
