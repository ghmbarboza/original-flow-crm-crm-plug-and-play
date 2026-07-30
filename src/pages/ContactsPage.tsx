import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, Search, Upload, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/ErrorState";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { ContactDrawer } from "@/components/contacts/ContactDrawer";
import { ContactFormDialog } from "@/components/contacts/ContactFormDialog";
import { ContactImportDialog } from "@/components/contacts/ContactImportDialog";
import { TagsPanel } from "@/components/contacts/TagsPanel";
import { GroupsPanel } from "@/components/contacts/GroupsPanel";
import { CONTACT_STATUS_LABEL, useContacts, type Contact, type ContactStatus } from "@/hooks/useContacts";
import { downloadCsv, toCsv } from "@/lib/csv";

const ALL_STATUS = "__all__";
const STATUSES = Object.keys(CONTACT_STATUS_LABEL) as ContactStatus[];

export default function ContactsPage() {
  const { data: contacts, isLoading, error } = useContacts();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL_STATUS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (contacts ?? []).filter((contact) => {
      if (status !== ALL_STATUS && contact.status !== status) return false;
      if (!term) return true;

      const haystack = [
        contact.first_name,
        contact.last_name,
        contact.email,
        contact.phone,
        contact.whatsapp_phone,
        contact.company?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [contacts, search, status]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setFormOpen(true);
    setSelectedId(null);
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("Não há contatos para exportar com o filtro atual.");
      return;
    }
    downloadCsv(
      "contatos.csv",
      toCsv(
        ["Nome", "Sobrenome", "Email", "Telefone", "WhatsApp", "Cargo", "Empresa", "Status", "Score", "Origem", "Tags"],
        filtered.map((c) => [
          c.first_name,
          c.last_name,
          c.email,
          c.phone,
          c.whatsapp_phone,
          c.title,
          c.company?.name,
          CONTACT_STATUS_LABEL[c.status],
          c.lead_score,
          c.source,
          c.contact_tags.map((ct) => ct.tag?.name).filter(Boolean).join(", "),
        ]),
      ),
    );
    toast.success(`${filtered.length} contato(s) exportado(s).`);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Users className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Contatos
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
              <Upload className="h-4 w-4" strokeWidth={1.5} />
              Importar
            </Button>
            <Button variant="outline" onClick={handleExport} className="gap-1.5">
              <Download className="h-4 w-4" strokeWidth={1.5} />
              Exportar
            </Button>
            <Button onClick={openCreate} className="gap-1.5" data-testid="contact-new">
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Novo contato
            </Button>
          </div>
        </div>

        {error && (
          <ErrorState
            title="Não foi possível carregar os contatos"
            message={
              <>
                {error instanceof Error ? error.message : "Erro desconhecido."} Recarregue a página; se
                persistir, avise um administrador.
              </>
            }
          />
        )}

        <Tabs defaultValue="list">
          {/* w-24 em cada aba: os três rótulos têm larguras diferentes e as abas
              ficavam desiguais; largura fixa as equaliza. */}
          <TabsList>
            <TabsTrigger value="list" className="w-24">Lista</TabsTrigger>
            <TabsTrigger value="groups" className="w-24">Grupos</TabsTrigger>
            <TabsTrigger value="tags" className="w-24">Tags</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-64 flex-1">
                <Search
                  className="absolute left-2.5 top-2.5 h-4 w-4"
                  strokeWidth={1.5}
                  style={{ color: "var(--via-text-muted)" }}
                />
                <Input
                  className="pl-8"
                  data-testid="contact-search"
                  placeholder="Buscar por nome, email, telefone ou empresa"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-44" aria-label="Filtrar por status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUS}>Todos os status</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{CONTACT_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ContactsTable
              contacts={filtered}
              isLoading={isLoading}
              isFiltered={search.trim() !== "" || status !== ALL_STATUS}
              onSelect={setSelectedId}
              onEdit={openEdit}
              onCreate={openCreate}
            />
          </TabsContent>

          <TabsContent value="groups" className="pt-4">
            <GroupsPanel />
          </TabsContent>

          <TabsContent value="tags" className="pt-4">
            <TagsPanel />
          </TabsContent>
        </Tabs>
      </div>

      <ContactDrawer
        contactId={selectedId}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onEdit={openEdit}
      />
      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} contact={editing} />
      <ContactImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppShell>
  );
}
