import { Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AgentLoadPanel } from "@/components/team/AgentLoadPanel";
import TeamSettings from "@/components/settings/TeamSettings";
import { useAuth } from "@/hooks/useAuth";

/**
 * Configurações > Equipe — reorganização final do sidebar (2026-07-31): a
 * página /team (supervisão em tempo real) foi unificada com a aba de gestão
 * que já existia aqui. O gating é o mesmo de antes, por seção:
 *
 *  - Atendimento em tempo real: admin, diretor ou gerente (como era em /team);
 *  - Aprovações/papéis/canais (TeamSettings): só admin (como era na aba);
 *  - Membro sem supervisão vê o aviso de acesso restrito, como via em /team.
 */
export default function EquipeSettings() {
  const { isAdmin, profile } = useAuth();
  const canSupervise = isAdmin || profile?.crm_role === "gerente" || profile?.crm_role === "diretor";

  if (!canSupervise && !isAdmin) {
    return (
      <div className="via-card mx-auto max-w-lg p-8 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <p className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
          Acesso restrito
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          O painel da equipe é visível para administradores, diretores e gerentes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canSupervise && (
        <div className="space-y-3">
          <Label>Atendimento em tempo real</Label>
          <AgentLoadPanel />
        </div>
      )}

      {isAdmin && (
        <>
          {canSupervise && <Separator />}
          <div className="space-y-3">
            <Label>Membros, papéis e canais</Label>
            <TeamSettings />
          </div>
        </>
      )}
    </div>
  );
}
