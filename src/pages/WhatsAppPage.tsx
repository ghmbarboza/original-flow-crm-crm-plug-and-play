import { MessageCircle } from "lucide-react";
import { PageStub } from "@/components/PageStub";

export default function WhatsAppPage() {
  return (
    <PageStub
      title="WhatsApp"
      description="Inbox unificado de conversas com atendimento por IA e transferência para humano."
      sprint="Sprint 3"
      icon={MessageCircle}
    />
  );
}
