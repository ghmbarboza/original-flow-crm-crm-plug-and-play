import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  BookOpen, Bot, FileText, GitBranch, MessageCircle, Shield, Zap, type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { TemplatePreviewDialog } from "@/components/library/TemplatePreviewDialog";
import {
  LIBRARY_CATEGORIES, rotuloCategoria, rotuloSubcategoria,
  useActivateTemplate, useLibraryTemplates, type LibraryTemplate,
} from "@/hooks/useLibraryTemplates";

/** Ícone Lucide por categoria — o resto da plataforma não usa emoji, e os
 *  mesmos ícones já identificam Sequências, Templates etc. no sidebar. */
const ICONE_CATEGORIA: Record<string, LucideIcon> = {
  email_sequence: GitBranch,
  email_template: FileText,
  followup: MessageCircle,
  automation: Zap,
  ai_faq: Bot,
  ai_objection: Shield,
};

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
    // AppShell: a Biblioteca era a única tela autenticada renderizada FORA do
    // shell — sem sidebar nem header, um beco cuja única saída era o botão
    // voltar. É também por isso que o axe via o sino "em 19 telas", não 20.
    <AppShell>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <BookOpen className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Biblioteca de Modelos
            </h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
            Modelos validados em mercado, prontos para ativar e personalizar.
          </p>
        </div>

        {/* aria-pressed: o estado do filtro era só visual (variant), invisível
            para leitor de tela — e a varredura acusava "Todos" como botão sem
            efeito ao clicá-lo já ativo. */}
        <div className="flex flex-wrap gap-2" data-testid="library-filtros">
          <Button
            size="sm"
            variant={categoria === null ? "default" : "outline"}
            aria-pressed={categoria === null}
            onClick={() => setCategoria(null)}
            data-testid="library-filtro-todos"
          >
            Todos
          </Button>
          {LIBRARY_CATEGORIES.map((c) => {
            const Icone = ICONE_CATEGORIA[c.value];
            return (
              <Button
                key={c.value}
                size="sm"
                variant={categoria === c.value ? "default" : "outline"}
                aria-pressed={categoria === c.value}
                onClick={() => setCategoria(c.value)}
                data-testid={`library-filtro-${c.value}`}
                className="gap-1.5"
              >
                {Icone && <Icone className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
                {c.label}
              </Button>
            );
          })}
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
            {visiveis.map((t) => {
              const Icone = ICONE_CATEGORIA[t.category] ?? BookOpen;
              return (
                // Mesmo desenho dos cards de Sequências/Grupos: via-card p-4,
                // chip de ícone, título font-medium — o card antigo usava
                // text-sm no título e emoji, destoando do resto.
                <div key={t.id} className="via-card group flex flex-col p-4" data-testid="library-card">
                  <div className="mb-2 flex items-start gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "var(--via-surface)" }}
                    >
                      <Icone className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} aria-hidden />
                    </div>
                    <p className="min-w-0 pt-1.5 font-medium" style={{ color: "var(--via-text-primary)" }}>
                      {t.title}
                    </p>
                  </div>
                  <p className="flex-1 text-sm" style={{ color: "var(--via-text-body)" }}>
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
              );
            })}
          </div>
        )}

        <TemplatePreviewDialog
          template={preview}
          onOpenChange={(open) => !open && setPreview(null)}
          onUsar={usar}
          ativando={ativar.isPending}
        />
      </div>
    </AppShell>
  );
}
