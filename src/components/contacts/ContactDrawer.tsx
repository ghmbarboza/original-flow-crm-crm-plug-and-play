import { useState } from "react";
import { toast } from "sonner";
import {
  Activity as ActivityIcon, Building2, Check, Mail, MessageCircle, Pencil,
  Phone, TrendingUp, User,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ContactStatusBadge } from "@/components/contacts/ContactStatusBadge";
import { useContact, type Contact } from "@/hooks/useContacts";
import { useSetContactTags, useTags } from "@/hooks/useTags";
import { useContactTimeline, type TimelineItem } from "@/hooks/useContactTimeline";

const KIND_ICON = {
  activity: ActivityIcon,
  email: Mail,
  whatsapp: MessageCircle,
  deal: TrendingUp,
} as const;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li className="flex gap-3">
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--via-surface)" }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            {item.title}
          </p>
          <time className="shrink-0 text-xs" style={{ color: "var(--via-text-muted)" }}>
            {formatDateTime(item.at)}
          </time>
        </div>
        {item.body && (
          <p className="line-clamp-2 text-sm" style={{ color: "var(--via-text-body)" }}>
            {item.body}
          </p>
        )}
        {item.meta && (
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            {item.meta}
          </p>
        )}
      </div>
    </li>
  );
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
  contactId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (contact: Contact) => void;
}

export function ContactDrawer({ contactId, onOpenChange, onEdit }: Props) {
  const { data: contact, isLoading } = useContact(contactId);
  const { data: allTags } = useTags();
  const { data: timeline, isLoading: loadingTimeline } = useContactTimeline(contactId);
  const setContactTags = useSetContactTags();
  const [tagsOpen, setTagsOpen] = useState(false);

  const contactTagIds = (contact?.contact_tags ?? [])
    .map((ct) => ct.tag?.id)
    .filter(Boolean) as string[];

  const toggleTag = async (tagId: string, checked: boolean) => {
    if (!contact) return;
    const next = checked
      ? [...contactTagIds, tagId]
      : contactTagIds.filter((id) => id !== tagId);
    try {
      await setContactTags.mutateAsync({ contactId: contact.id, tagIds: next });
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível alterar as tags: ${error.message}` : "Não foi possível alterar as tags.",
      );
    }
  };

  const fullName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || "Contato sem nome"
    : "";

  return (
    <Sheet open={!!contactId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {isLoading || !contact ? (
          <>
            {/* O título existe mesmo carregando: sem ele o leitor de tela abre um painel anônimo. */}
            <SheetHeader className="text-left">
              <SheetTitle>Carregando contato…</SheetTitle>
              <SheetDescription>Buscando os dados e o histórico.</SheetDescription>
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
                <SheetTitle className="text-xl">{fullName}</SheetTitle>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(contact)}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Editar
                </Button>
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <ContactStatusBadge status={contact.status} />
                <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                  Score {contact.lead_score}
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              <section className="grid grid-cols-2 gap-4">
                <Field icon={Mail} label="Email" value={contact.email} />
                <Field icon={Phone} label="Telefone" value={contact.phone} />
                <Field icon={MessageCircle} label="WhatsApp" value={contact.whatsapp_phone} />
                <Field icon={User} label="Cargo" value={contact.title} />
                <Field icon={Building2} label="Empresa" value={contact.company?.name ?? null} />
                <Field icon={TrendingUp} label="Origem" value={contact.source} />
              </section>

              <Separator />

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                    Tags
                  </h3>
                  <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm">Gerenciar</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      {(allTags ?? []).length === 0 ? (
                        <p className="p-2 text-sm" style={{ color: "var(--via-text-muted)" }}>
                          Nenhuma tag criada ainda. Crie tags na aba Tags.
                        </p>
                      ) : (
                        <div className="max-h-56 space-y-1 overflow-y-auto">
                          {(allTags ?? []).map((tag) => (
                            <label
                              key={tag.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-accent"
                            >
                              <Checkbox
                                checked={contactTagIds.includes(tag.id)}
                                onCheckedChange={(checked) => toggleTag(tag.id, checked === true)}
                              />
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: tag.color }}
                              />
                              <span className="truncate text-sm">{tag.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                {contactTagIds.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
                    Sem tags. Use tags para segmentar campanhas e grupos dinâmicos.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {contact.contact_tags.map(({ tag }) =>
                      tag ? (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ background: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ) : null,
                    )}
                  </div>
                )}
              </section>

              <Separator />

              <section className="space-y-3">
                <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  Histórico
                </h3>
                {loadingTimeline ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (timeline ?? []).length === 0 ? (
                  <div className="via-card p-4 text-center">
                    <Check className="mx-auto mb-2 h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
                    <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
                      Nada registrado ainda.
                    </p>
                    <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                      Atividades, emails, negócios e conversas deste contato aparecem aqui.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {(timeline ?? []).map((item) => (
                      <TimelineEntry key={item.id} item={item} />
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
