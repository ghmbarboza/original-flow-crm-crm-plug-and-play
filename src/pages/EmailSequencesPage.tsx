import { GitBranch } from "lucide-react";
import { PageStub } from "@/components/PageStub";

export default function EmailSequencesPage() {
  return (
    <PageStub
      title="Sequências de email"
      description="Sequências com etapas, delays e inscrição de contatos."
      sprint="Sprint 4"
      icon={GitBranch}
    />
  );
}
