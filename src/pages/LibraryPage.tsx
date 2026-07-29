import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { TemplatePreviewDialog } from "@/components/library/TemplatePreviewDialog";
import {
  LIBRARY_CATEGORIES, rotuloCategoria, rotuloSubcategoria,
  useActivateTemplate, useLibraryTemplates, type LibraryTemplate,
} from "@/hooks/useLibraryTemplates";

/** Resumo de uma linha para o card, por categoria. */
function resumo(t: LibraryTemplate): string {
  const c = (t.content ?? {}) as Record<string, unknown>;
  const n = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[]).length : 0);
  switch (t.category) {
    case "email_sequence": return `${n("steps")} emails`;
    case "followup": return `${n("steps")} tentativas`;
    case "ai_faq": return `${n("faqs")} perguntas`;
    case "ai_objection": return `${n("objections")} objeções`;
    case "automation": return `${n("actions")} ação(ões)`;
    default: return "modelo único";
  }
}

export default function LibraryPage() {
  // Os empty states das outras telas linkam com ?categoria=, para o usuário cair
  // já filtrado no que estava faltando em vez de num catálogo de 16 itens.
  const [params] = useSearchParams();
  const [categoria, setCategoria] = useState<string | null>(params.get("categoria"));
  const [preview, setPreview] = useState<LibraryTemplate | null>(null);
  const navigate = useNavigate();

  // Busca sempre tudo e filtra no cliente: são 16 registros globais e sem
  // paginação, então trocar de aba não precisa de ida ao servidor.
  const { data: modelos, isLoading, error, refetch } = useLibraryTemplates();
  const ativar = useActivateTemplate();

  const visiveis = useMemo(
    () => (modelos ?? []).filter((m) => !categoria || m.category === categoria),
    [modelos, categoria],
  );

  const usar = (t: LibraryTemplate) => {
    ativar.mutate(t, {
      onSuccess: ({ destino }) => {
        setPreview(null);
        toast.success("Modelo ativado. Personalize antes de publicar.");
        navigate(destino);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível ativar o modelo."),
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          Biblioteca de Modelos
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Templates prontos para ativar e personalizar
        </p>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="library-filtros">
        <Button
          size="sm"
          variant={categoria === null ? "default" : "outline"}
          onClick={() => setCategoria(null)}
          data-testid="library-filtro-todos"
        >
          Todos
        </Button>
        {LIBRARY_CATEGORIES.map((c) => (
          <Button
            key={c.value}
            size="sm"
            variant={categoria === c.value ? "default" : "outline"}
            onClick={() => setCategoria(c.value)}
            data-testid={`library-filtro-${c.value}`}
          >
            <span aria-hidden className="mr-1">{c.icon}</span>
            {c.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : error ? (
        <ErrorState
          error={error}
          action={<Button variant="outline" size="sm" onClick={() => refetch()}>Tentar de novo</Button>}
        />
      ) : visiveis.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhum modelo nesta categoria"
          description="Escolha outra categoria ou veja todos os modelos disponíveis."
          action={<Button variant="outline" onClick={() => setCategoria(null)}>Ver todos</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="library-grid">
          {visiveis.map((t) => (
            <div key={t.id} className="via-card flex flex-col p-5" data-testid="library-card">
              <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                <span aria-hidden className="mr-1">
                  {LIBRARY_CATEGORIES.find((c) => c.value === t.category)?.icon}
                </span>
                {t.title}
              </p>
              <p className="mt-2 flex-1 text-sm" style={{ color: "var(--via-text-body)" }}>
                {t.description}
              </p>
              <p className="mt-3 text-xs" style={{ color: "var(--via-text-muted)" }}>
                {rotuloCategoria(t.category)} · {rotuloSubcategoria(t.subcategory)} · {resumo(t)}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 self-start"
                onClick={() => setPreview(t)}
                data-testid="library-ver-modelo"
              >
                Ver modelo
              </Button>
            </div>
          ))}
        </div>
      )}

      <TemplatePreviewDialog
        template={preview}
        onOpenChange={(open) => !open && setPreview(null)}
        onUsar={usar}
        ativando={ativar.isPending}
      />
    </div>
  );
}
