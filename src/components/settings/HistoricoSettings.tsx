import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useOrganization, useUpdateOrganization } from "@/hooks/useSetup";

/**
 * O que entra sozinho na linha do tempo do negócio e do contato
 * (organizations.history_settings, lido pelo trigger tg_log_deal_change e
 * pelas edge functions da IA).
 *
 * Cada chave grava na hora, como o switch de negócio automático: quem desliga
 * "mudanças pela IA" espera que a próxima já não apareça.
 */
export interface HistorySettings {
  stage_changes: boolean;
  status_changes: boolean;
  origins: { usuario: boolean; ia: boolean; automacao: boolean };
  ai_notes: boolean;
}

function lerHistorySettings(bruto: unknown): HistorySettings {
  const h = (bruto ?? {}) as Partial<HistorySettings>;
  return {
    stage_changes: h.stage_changes ?? true,
    status_changes: h.status_changes ?? true,
    origins: {
      usuario: h.origins?.usuario ?? true,
      ia: h.origins?.ia ?? true,
      automacao: h.origins?.automacao ?? true,
    },
    ai_notes: h.ai_notes ?? true,
  };
}

interface Linha {
  id: string;
  titulo: string;
  descricao: string;
  valor: boolean;
  aplicar: (h: HistorySettings, v: boolean) => HistorySettings;
}

export function HistoricoSettings() {
  const { data: org } = useOrganization();
  const salvar = useUpdateOrganization();
  // O último valor gravado por esta tela vence o `org` do cache, que pode ainda
  // não ter voltado do refetch quando o próximo switch é clicado; sem isso o
  // segundo clique partiria do estado antigo e apagaria o primeiro.
  const [gravado, setGravado] = useState<HistorySettings | null>(null);
  const atual = gravado ?? lerHistorySettings((org as { history_settings?: unknown } | null)?.history_settings);

  const alternar = async (linha: Linha, valor: boolean) => {
    const proximo = linha.aplicar(atual, valor);
    try {
      setGravado(proximo);
      await salvar.mutateAsync({ history_settings: proximo as never });
      toast.success(valor ? `${linha.titulo}: passa a ser registrado.` : `${linha.titulo}: deixa de ser registrado.`);
    } catch (e) {
      setGravado(atual);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const linhas: Linha[] = [
    {
      id: "stage_changes",
      titulo: "Mudanças de etapa",
      descricao: "Toda vez que o negócio troca de etapa, entra uma linha com de onde veio, para onde foi e quem moveu.",
      valor: atual.stage_changes,
      aplicar: (h, v) => ({ ...h, stage_changes: v }),
    },
    {
      id: "status_changes",
      titulo: "Ganho, perdido e reaberto",
      descricao: "Registra quando o negócio é marcado como ganho ou perdido, e quando volta a ficar aberto.",
      valor: atual.status_changes,
      aplicar: (h, v) => ({ ...h, status_changes: v }),
    },
    {
      id: "origin_usuario",
      titulo: "Movimentos feitos pela equipe",
      descricao: "Arrastar no Kanban ou trocar a etapa na ficha, com o nome de quem fez.",
      valor: atual.origins.usuario,
      aplicar: (h, v) => ({ ...h, origins: { ...h.origins, usuario: v } }),
    },
    {
      id: "origin_ia",
      titulo: "Movimentos feitos pela IA",
      descricao: "Quando a IA move o negócio durante a conversa, com o motivo que ela deu.",
      valor: atual.origins.ia,
      aplicar: (h, v) => ({ ...h, origins: { ...h.origins, ia: v } }),
    },
    {
      id: "origin_automacao",
      titulo: "Movimentos feitos por automação",
      descricao: "Regras de gatilho e ação, webhooks e integrações que movem o negócio.",
      valor: atual.origins.automacao,
      aplicar: (h, v) => ({ ...h, origins: { ...h.origins, automacao: v } }),
    },
    {
      id: "ai_notes",
      titulo: "Anotações da IA",
      descricao: "Intenção de compra detectada, transferência para a equipe, sugestão de etapa e abordagem ativa viram anotações na ficha.",
      valor: atual.ai_notes,
      aplicar: (h, v) => ({ ...h, ai_notes: v }),
    },
  ];

  return (
    <div className="via-card divide-y p-0" style={{ borderColor: "var(--via-border)" }} data-testid="historico-settings">
      {linhas.map((linha) => (
        <div key={linha.id} className="flex items-start justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>{linha.titulo}</p>
            <p className="mt-0.5 max-w-xl text-xs" style={{ color: "var(--via-text-muted)" }}>{linha.descricao}</p>
          </div>
          <Switch
            aria-label={linha.titulo}
            checked={linha.valor}
            disabled={!org || salvar.isPending}
            onCheckedChange={(v) => alternar(linha, v)}
            data-testid={`historico-${linha.id}`}
          />
        </div>
      ))}
    </div>
  );
}
