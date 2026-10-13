import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { funilAtivo } from "@/lib/funis";
import type { Database } from "@/integrations/supabase/types";

export type Pipeline = Database["public"]["Tables"]["pipelines"]["Row"];

// Código que o banco devolve quando alguma etapa do funil ainda tem negócio
// (trigger trg_etapa_com_negocio, disparado pela exclusão em cascata).
const FUNIL_COM_NEGOCIO = "23503";

// O app não recarrega consulta sozinho (staleTime infinito): criar, renomear ou
// excluir funil precisa invalidar tudo que mostra funil ou etapa.
const CONSULTAS_COM_FUNIL = [
  "pipelines", "pipeline-stages", "deals", "capture-forms", "capture-form-targets", "stage-criteria", "ai-source-profiles",
] as const;

function useInvalidarFunis() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return () => Promise.all(
    CONSULTAS_COM_FUNIL.map((chave) => queryClient.invalidateQueries({ queryKey: [chave, orgId] })),
  );
}

/** Funis da organização: o padrão primeiro, depois por ordem de criação. */
export function usePipelines() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["pipelines", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Pipeline[]> => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .eq("org_id", orgId!)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const chaveDoFunilSalvo = (orgId: string) => `flowcrm:funil:${orgId}`;

function lerFunilSalvo(orgId: string | null | undefined): string | null {
  if (!orgId) return null;
  try {
    return localStorage.getItem(chaveDoFunilSalvo(orgId));
  } catch {
    return null; // Navegador sem armazenamento: a tela abre no funil padrão.
  }
}

/**
 * Funil aberto na tela. Fica lembrado no navegador, por organização, para a
 * pessoa voltar ao funil em que trabalha; se ele deixou de existir, cai no padrão.
 */
export function useFunilAtivo() {
  const orgId = useOrgId();
  const { data: funis, isLoading } = usePipelines();
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const lista = funis ?? [];
  const funilId = funilAtivo(lista, escolhido ?? lerFunilSalvo(orgId));

  const escolher = (id: string) => {
    setEscolhido(id);
    if (!orgId) return;
    try {
      localStorage.setItem(chaveDoFunilSalvo(orgId), id);
    } catch {
      // Sem armazenamento a escolha vale só enquanto a tela estiver aberta.
    }
  };

  return {
    funis: lista,
    funilId,
    funil: lista.find((f) => f.id === funilId) ?? null,
    padraoId: lista.find((f) => f.is_default)?.id ?? lista[0]?.id ?? null,
    escolher,
    isLoading,
  };
}

interface EtapaInicial {
  name: string;
  color: string;
  win_probability: number;
}

/** Cria um funil já com as etapas iniciais, para o Kanban dele nascer com colunas. */
export function useCreatePipeline() {
  const orgId = useOrgId();
  const invalidar = useInvalidarFunis();
  return useMutation({
    mutationFn: async ({ name, etapas }: { name: string; etapas: EtapaInicial[] }): Promise<string> => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { data: funil, error } = await supabase
        .from("pipelines").insert({ org_id: orgId, name, is_default: false }).select("id").single();
      if (error) throw error;

      const linhas = etapas.map((e, i) => ({ ...e, org_id: orgId, pipeline_id: funil.id, order: i }));
      const { error: erroEtapas } = await supabase.from("pipeline_stages").insert(linhas);
      if (erroEtapas) {
        // Funil sem etapa não serve para nada: desfaz, em vez de deixar pela metade.
        const { error: erroAoDesfazer } = await supabase.from("pipelines").delete().eq("id", funil.id);
        if (erroAoDesfazer) {
          throw new Error(`O funil "${name}" foi criado sem etapas e não pôde ser removido. Exclua-o em Configurações > Automações > Funil. (${erroEtapas.message})`);
        }
        throw erroEtapas;
      }
      return funil.id;
    },
    // Também em erro: se sobrou funil sem etapas, ele precisa aparecer para ser excluído.
    onSettled: invalidar,
  });
}

export function useRenamePipeline() {
  const invalidar = useInvalidarFunis();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("pipelines").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Marca o funil como padrão: é nele que entram os negócios criados sozinhos. */
export function useSetDefaultPipeline() {
  const invalidar = useInvalidarFunis();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("set_default_pipeline", { _pipeline_id: id });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Exclui o funil e as etapas dele. Com negócio em alguma etapa, o banco recusa. */
export function useDeletePipeline() {
  const invalidar = useInvalidarFunis();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipelines").delete().eq("id", id);
      if (!error) return;
      if (error.code === FUNIL_COM_NEGOCIO) {
        throw new Error("Este funil tem negócios. Mova ou exclua os negócios antes de excluir o funil.");
      }
      throw error;
    },
    onSuccess: invalidar,
  });
}
