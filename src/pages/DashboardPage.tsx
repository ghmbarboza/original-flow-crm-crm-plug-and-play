import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { profile, role } = useAuth();

  return (
    <AppShell>
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <h1
            className="font-display text-3xl font-medium tracking-tight"
            style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
          >
            Dashboard
          </h1>
          {role && <Badge variant="secondary" className="capitalize">{role}</Badge>}
        </div>
        <p style={{ color: "var(--via-text-body)" }}>
          Bem-vindo{profile ? `, ${profile.full_name}` : ""}! Este é o projeto base.
          Faça remix para adicionar as funcionalidades do seu produto.
        </p>
      </div>
    </AppShell>
  );
}
