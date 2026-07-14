import { Mail } from "lucide-react";
import { PageStub } from "@/components/PageStub";

export default function InboxPage() {
  return (
    <PageStub
      title="Email"
      description="Caixa de entrada com sincronização Gmail e histórico de threads por contato."
      sprint="Sprint 4"
      icon={Mail}
    />
  );
}
