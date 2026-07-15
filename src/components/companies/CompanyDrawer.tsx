import {
  Briefcase, Building2, Globe, Layers, Pencil, User, Users,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ContactStatusBadge } from "@/components/contacts/ContactStatusBadge";
import {
  useCompany, useCompanyContacts, useCompanyDeals,
  type Company, type CompanyDeal,
} from "@/hooks/useCompanies";
import { useOrgMemberNames } from "@/hooks/useOrgMembers";

const DEAL_STATUS_LABEL: Record<CompanyDeal["status"], string> = {
  open: "Em aberto",
  won: "Ganho",
  lost: "Perdido",
};

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

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
  companyId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (company: Company) => void;
  /** Abre o contato no drawer de contatos, sem sair da página de empresas. */
  onSelectContact: (contactId: string) => void;
}

export function CompanyDrawer({ companyId, onOpenChange, onEdit, onSelectContact }: Props) {
  const { data: company, isLoading } = useCompany(companyId);
  const { data: contacts, isLoading: loadingContacts } = useCompanyContacts(companyId);
  const { data: deals, isLoading: loadingDeals } = useCompanyDeals(companyId);
  const memberNames = useOrgMemberNames();

  const ownerName = company?.owner_id ? memberNames.get(company.owner_id) ?? null : null;

  return (
    <Sheet open={!!companyId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {isLoading || !company ? (
          <>
            {/* O título existe mesmo carregando: sem ele o leitor de tela abre um painel anônimo. */}
            <SheetHeader className="text-left">
              <SheetTitle>Carregando empresa…</SheetTitle>
              <SheetDescription>Buscando os dados, contatos e negócios.</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 pt-6">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="space-y-2 pr-8 text-left">
              <div className="flex items-start justify-between gap-2">
                <SheetTitle className="text-xl">{company.name}</SheetTitle>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(company)}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Editar
                </Button>
              </div>
              <SheetDescription>
                {company.domain ?? "Sem domínio cadastrado"}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              <section className="grid grid-cols-2 gap-4">
                <Field icon={Globe} label="Domínio" value={company.domain} />
                <Field icon={Building2} label="Site" value={company.website} />
                <Field icon={Layers} label="Setor" value={company.industry} />
                <Field icon={Users} label="Tamanho" value={company.size ? `${company.size} funcionários` : null} />
                <Field icon={User} label="Owner" value={ownerName} />
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  <Users className="h-4 w-4" strokeWidth={1.5} />
                  Contatos
                  {(contacts ?? []).length > 0 && (
                    <span className="text-xs font-normal" style={{ color: "var(--via-text-muted)" }}>
                      {contacts!.length}
                    </span>
                  )}
                </h3>
                {loadingContacts ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (contacts ?? []).length === 0 ? (
                  <div className="via-card p-4 text-center">
                    <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
                      Nenhum contato vinculado.
                    </p>
                    <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                      Vincule contatos a esta empresa pelo campo Empresa do contato.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {(contacts ?? []).map((contact) => {
                      const name =
                        [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
                        "(sem nome)";
                      return (
                        <li key={contact.id}>
                          <button
                            type="button"
                            onClick={() => onSelectContact(contact.id)}
                            className="via-card flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-accent"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                                {name}
                              </p>
                              <p className="truncate text-xs" style={{ color: "var(--via-text-muted)" }}>
                                {[contact.title, contact.email].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </div>
                            <ContactStatusBadge status={contact.status} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  <Briefcase className="h-4 w-4" strokeWidth={1.5} />
                  Negócios
                  {(deals ?? []).length > 0 && (
                    <span className="text-xs font-normal" style={{ color: "var(--via-text-muted)" }}>
                      {deals!.length}
                    </span>
                  )}
                </h3>
                {loadingDeals ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (deals ?? []).length === 0 ? (
                  <div className="via-card p-4 text-center">
                    <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
                      Nenhum negócio vinculado.
                    </p>
                    <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                      Negócios criados para esta empresa aparecem aqui com etapa e valor.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {(deals ?? []).map((deal) => (
                      <li key={deal.id} className="via-card flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                            {deal.title}
                          </p>
                          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--via-text-muted)" }}>
                            {deal.stage && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: deal.stage.color }}
                              />
                            )}
                            {deal.stage?.name ?? DEAL_STATUS_LABEL[deal.status]}
                          </p>
                        </div>
                        <span
                          className="shrink-0 text-sm tabular-nums"
                          style={{ color: "var(--via-text-primary)" }}
                        >
                          {formatMoney(deal.value, deal.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
