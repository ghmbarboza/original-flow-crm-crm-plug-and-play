import { TemplateDraftsList } from "@/components/campaigns/TemplateDraftsList";
import { useState } from "react";
import { FileText, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TemplateFormDialog } from "@/components/campaigns/TemplateFormDialog";
import {
  TEMPLATE_CATEGORY_LABEL, TEMPLATE_STATUS_LABEL, useMessageTemplates,
} from "@/hooks/useMessageTemplates";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  APPROVED: { bg: "var(--via-success-bg, #dcfce7)", text: "var(--via-success-text, #166534)" },
  PENDING: { bg: "var(--via-warning-bg, #fef9c3)", text: "var(--via-warning-text, #854d0e)" },
  REJECTED: { bg: "var(--via-danger-bg, #fee2e2)", text: "var(--via-danger-text, #991b1b)" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={style
        ? { background: style.bg, color: style.text }
        : { background: "var(--via-surface)", color: "var(--via-text-body)" }}
    >
      {TEMPLATE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function TemplatesTab() {
  return (
    <div className="space-y-4">
      <TemplatesDoProvedor />
      <TemplateDraftsList />
    </div>
  );
}

function TemplatesDoProvedor() {
  const { data, isLoading, error, refetch, isFetching } = useMessageTemplates();
  const [formOpen, setFormOpen] = useState(false);
  // A Evolution API não tem templates (só Meta Oficial e Zernio). Nesse caso a
  // query nem roda — mostramos uma nota no lugar da tabela e dos botões.
  const provedorSemTemplate = !data && !isLoading && !error;

  const templates = data?.templates ?? [];

  if (provedorSemTemplate) {
    return (
      <div className="via-card p-8 text-center">
        <FileText className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Templates não se aplicam ao seu canal
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: "var(--via-text-muted)" }}>
          Templates existem apenas na API Oficial (Meta) e no Zernio. Com a Evolution API, as
          mensagens de campanha são enviadas como conversas normais — conecte a API Oficial ou o
          Zernio em Integrações para usar templates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          O WhatsApp só permite iniciar conversa de negócio por template aprovado. Os templates
          são lidos direto do provedor, então o status reflete a revisão da Meta em tempo real.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            Atualizar
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Novo template
          </Button>
        </div>
      </div>


      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <div className="via-card p-8 text-center">
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Não foi possível carregar os templates
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--via-text-muted)" }}>
            {error instanceof Error ? error.message : "Erro desconhecido."}
          </p>
        </div>
      ) : templates.length === 0 ? (
        <div className="via-card p-10 text-center">
          <FileText className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            Nenhum template ainda
          </p>
          <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
            Crie um template para poder disparar campanhas.
          </p>
          <Button onClick={() => setFormOpen(true)}>Criar primeiro template</Button>
        </div>
      ) : (
        <div className="via-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Idioma</TableHead>
                <TableHead className="text-right">Variáveis</TableHead>
                <TableHead>Corpo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((tpl) => (
                <TableRow key={`${tpl.name}-${tpl.language}`}>
                  <TableCell className="font-medium">{tpl.name}</TableCell>
                  <TableCell><StatusBadge status={tpl.status} /></TableCell>
                  <TableCell style={{ color: "var(--via-text-muted)" }}>
                    {TEMPLATE_CATEGORY_LABEL[tpl.category] ?? tpl.category}
                  </TableCell>
                  <TableCell style={{ color: "var(--via-text-muted)" }}>{tpl.language}</TableCell>
                  <TableCell className="text-right tabular-nums">{tpl.param_count}</TableCell>
                  <TableCell className="max-w-sm truncate" style={{ color: "var(--via-text-muted)" }}>
                    {tpl.body_text}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TemplateFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
