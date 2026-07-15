import { CheckSquare, FileText, Mail, Phone, Users } from "lucide-react";
import { ACTIVITY_TYPE_LABEL, type ActivityType } from "@/hooks/useActivities";

const TYPE_ICON: Record<ActivityType, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: FileText,
  task: CheckSquare,
};

/** Ícone + rótulo do tipo de atividade. Cores neutras (a paleta não usa cor por tipo). */
export function ActivityTypeBadge({ type, iconOnly }: { type: ActivityType; iconOnly?: boolean }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--via-text-body)" }}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
      {!iconOnly && ACTIVITY_TYPE_LABEL[type]}
    </span>
  );
}
