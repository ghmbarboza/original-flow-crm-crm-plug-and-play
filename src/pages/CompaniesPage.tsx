import { useMemo, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompaniesTable } from "@/components/companies/CompaniesTable";
import { CompanyDrawer } from "@/components/companies/CompanyDrawer";
import { CompanyFormDialog } from "@/components/companies/CompanyFormDialog";
import { ContactDrawer } from "@/components/contacts/ContactDrawer";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { useCompanies, type Company } from "@/hooks/useCompanies";
import type { Contact } from "@/hooks/useContacts";

export default function CompaniesPage() {
  const { data: companies, isLoading, error } = useCompanies();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Company | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Um contato aberto a partir do drawer da empresa reusa o drawer de contatos.
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactFormOpen, setContactFormOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies ?? [];
    return (companies ?? []).filter((company) => {
      const haystack = [company.name, company.domain, company.industry]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [companies, search]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (company: Company) => {
    setEditing(company);
    setFormOpen(true);
    setSelectedId(null);
  };

  const openEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setContactFormOpen(true);
    setSelectedContactId(null);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Empresas
            </h1>
          </div>
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nova empresa
          </Button>
        </div>

        {error && (
          <div className="via-card p-4">
            <p className="text-sm font-medium text-via-coral">Não foi possível carregar as empresas</p>
            <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
              {error instanceof Error ? error.message : "Erro desconhecido."} Recarregue a página; se
              persistir, avise um administrador.
            </p>
          </div>
        )}

        <div className="relative min-w-64 max-w-md">
          <Search
            className="absolute left-2.5 top-2.5 h-4 w-4"
            strokeWidth={1.5}
            style={{ color: "var(--via-text-muted)" }}
          />
          <Input
            className="pl-8"
            placeholder="Buscar por nome, domínio ou setor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <CompaniesTable
          companies={filtered}
          isLoading={isLoading}
          isFiltered={search.trim() !== ""}
          onSelect={setSelectedId}
          onEdit={openEdit}
          onCreate={openCreate}
        />
      </div>

      <CompanyDrawer
        companyId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onEdit={openEdit}
        onSelectContact={setSelectedContactId}
      />
      <CompanyFormDialog open={formOpen} onOpenChange={setFormOpen} company={editing} />

      <ContactDrawer
        contactId={selectedContactId}
        onOpenChange={(open) => !open && setSelectedContactId(null)}
        onEdit={openEditContact}
      />
      <ContactFormDialog
        open={contactFormOpen}
        onOpenChange={setContactFormOpen}
        contact={editingContact}
      />
    </AppShell>
  );
}
