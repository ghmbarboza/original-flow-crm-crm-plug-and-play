import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Building2, Calendar, Pencil, Percent, TrendingUp, User,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DealStatusBadge } from "@/components/deals/DealStatusBadge";
import { contactName, type Deal } from "@/hooks/useDeals";
import { useOrgMemberNames } from "@/hooks/useOrgMembers";
import { formatCurrency, formatDate } from "@/lib/format";

function Field({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
      <div className="min-w-0">
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{label}</p>
        <p className="truncate text-sm" style={{ color: value ? "var(--via-text-primary)" : "var(--via-text-muted)" }}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

interface Props {
  deal: Deal | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (deal: Deal) => void;
}

/** Preview rápido do deal ao clicar num card do Kanban ou linha da lista. */
export function DealPreviewDrawer({ deal, onOpenChange, onEdit }: Props) {
  const navigate = useNavigate();
  const ownerNames = useOrgMemberNames();

  return (
    <Sheet open={!!deal} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {deal && (
          <>
            <SheetHeader className="space-y-2 pr-8 text-left">
              <div className="flex items-start justify-between gap-2">
                <SheetTitle className="text-xl">{deal.title}</SheetTitle>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(deal)}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Editar
                </Button>
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <DealStatusBadge status={deal.status} />
                {deal.stage && (
                  <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--via-text-muted)" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: deal.stage.color }} aria-hidden />
                    {deal.stage.name}
                  </span>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>
                {formatCurrency(deal.value, deal.currency)}
              </p>

              <section className="grid grid-cols-2 gap-4">
                <Field icon={User} label="Contato" value={contactName(deal.contact)} />
                <Field icon={Building2} label="Empresa" value={deal.company?.name ?? null} />
                <Field
                  icon={TrendingUp}
                  label="Owner"
                  value={deal.owner_id ? ownerNames.get(deal.owner_id) ?? null : null}
                />
                <Field icon={Percent} label="Probabilidade" value={`${deal.probability}%`} />
                <Field icon={Calendar} label="Fechamento" value={formatDate(deal.close_date)} />
              </section>

              <Separator />

              <Button className="w-full gap-1.5" onClick={() => navigate(`/deals/${deal.id}`)}>
                Abrir negócio completo
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
