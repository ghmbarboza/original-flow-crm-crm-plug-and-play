import { CONTACT_STATUS_LABEL, type ContactStatus } from "@/hooks/useContacts";
import { cn } from "@/lib/utils";

/**
 * Cor por status via classes de token (sem hex inline): lead e prospect avançam
 * do cinza ao navy, cliente é sucesso, perdido é coral.
 */
const STATUS_CLASS: Record<ContactStatus, string> = {
  lead: "bg-via-gray-200 text-via-gray-700",
  prospect: "bg-via-blue text-white",
  customer: "bg-via-success text-white",
  churned: "bg-via-coral text-white",
};

export function ContactStatusBadge({ status }: { status: ContactStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASS[status],
      )}
    >
      {CONTACT_STATUS_LABEL[status]}
    </span>
  );
}
