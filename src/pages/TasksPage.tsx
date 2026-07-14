import { CheckSquare } from "lucide-react";
import { PageStub } from "@/components/PageStub";

export default function TasksPage() {
  return (
    <PageStub
      title="Tarefas"
      description="Tarefas com filtros, ordenação e conclusão."
      sprint="Sprint 2"
      icon={CheckSquare}
    />
  );
}
