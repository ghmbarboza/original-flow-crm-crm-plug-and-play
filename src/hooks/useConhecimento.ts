import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useAuth } from "@/hooks/useAuth";
import type { Database, Json } from "@/integrations/supabase/types";
import { dividirEmTrechos, impressaoDigital, relatorioDe, type StatusDocumento, type TipoDocumento } from "@/lib/conhecimento";

/**
 * Base de conhecimento da IA (Sprint 12 B10): documentos (com trechos gravados
 * pela RPC), fatos canônicos, perguntas sem resposta e teste de busca.
 */

export type KnowledgeDocument = Database["public"]["Tables"]["knowledge_documents"]["Row"];
export type KnowledgeFact = Database["public"]["Tables"]["knowledge_facts"]["Row"];
export type UnansweredQuestion = Database["public"]["Tables"]["unanswered_questions"]["Row"];
export interface ResultadoBusca { source_type: string; source_id: string; title: string; content: string; rank: number }

const CHAVES = ["knowledge-documents", "knowledge-facts", "unanswered-questions"] as const;

function useInvalidar() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return () => { for (const k of CHAVES) queryClient.invalidateQueries({ queryKey: [k, orgId] }); };
}

// --- Documentos ------------------------------------------------------------

export function useKnowledgeDocuments() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["knowledge-documents", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<KnowledgeDocument[]> => {
      const { data, error } = await supabase.from("knowledge_documents").select("*").eq("org_id", orgId!).neq("status", "archived").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface EntradaDocumento {
  id?: string;
  title: string;
  content: string;
  docType: TipoDocumento;
  sourceUrl?: string | null;
  fileName?: string | null;
  status?: StatusDocumento;
  partesIlegiveis?: string[];
}

/** Divide em trechos no navegador e grava tudo numa transação (RPC). */
export function useSaveKnowledgeDocument() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: EntradaDocumento): Promise<KnowledgeDocument> => {
      const conteudo = input.content.trim();
      const trechos = dividirEmTrechos(conteudo);
      const semTexto = trechos.length === 0;
      const status: StatusDocumento = semTexto ? "error" : (input.status ?? "approved");
      const { data, error } = await supabase.rpc("gravar_documento_conhecimento", {
        p_document_id: input.id ?? null,
        p_title: input.title.trim(),
        p_content: conteudo,
        p_doc_type: input.docType,
        p_source_url: input.sourceUrl ?? null,
        p_file_name: input.fileName ?? null,
        p_fingerprint: await impressaoDigital(input.docType, input.sourceUrl ?? null, conteudo),
        p_status: status,
        p_ingestion_report: relatorioDe(trechos, conteudo, input.partesIlegiveis ?? [], input.fileName ?? undefined) as unknown as Json,
        p_error_message: semTexto ? "Não foi possível extrair texto deste material." : null,
        p_chunks: trechos,
      });
      if (error) throw new Error(error.message);
      return data as KnowledgeDocument;
    },
    onSuccess: invalidar,
  });
}

export function useSetDocumentStatus() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: { id: string; status: StatusDocumento }) => {
      const { error } = await supabase.from("knowledge_documents").update({ status: input.status }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

export function useDeleteKnowledgeDocument() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

// --- Fatos -----------------------------------------------------------------

export function useKnowledgeFacts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["knowledge-facts", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<KnowledgeFact[]> => {
      const { data, error } = await supabase.from("knowledge_facts").select("*").eq("org_id", orgId!).neq("status", "archived").order("category").order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface EntradaFato {
  id?: string;
  title: string;
  category: string;
  question?: string | null;
  fact: string;
  always_include: boolean;
  status: "confirmed" | "needs_review";
  expires_at?: string | null;
}

export function useSaveKnowledgeFact() {
  const orgId = useOrgId();
  const { user } = useAuth();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: EntradaFato): Promise<KnowledgeFact> => {
      if (!orgId) throw new Error("Organização não carregada.");
      const campos = {
        title: input.title.trim(), category: input.category.trim() || "geral", question: input.question?.trim() || null, fact: input.fact.trim(),
        always_include: input.always_include, status: input.status, expires_at: input.expires_at || null,
        confirmed_by: input.status === "confirmed" ? user?.id ?? null : null, confirmed_at: input.status === "confirmed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      const q = input.id
        ? supabase.from("knowledge_facts").update(campos).eq("id", input.id).select("*").single()
        : supabase.from("knowledge_facts").insert({ org_id: orgId, ...campos }).select("*").single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useDeleteKnowledgeFact() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_facts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

// --- Perguntas sem resposta -------------------------------------------------

export function useUnansweredQuestions() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["unanswered-questions", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<UnansweredQuestion[]> => {
      const { data, error } = await supabase.from("unanswered_questions").select("*").eq("org_id", orgId!).eq("status", "open").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResolveUnanswered() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (input: { id: string; status: "resolved" | "ignored"; factId?: string | null }) => {
      const { error } = await supabase.from("unanswered_questions").update({ status: input.status, resolved_fact_id: input.factId ?? null }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

// --- Busca (teste) -----------------------------------------------------------

export function useSearchKnowledge() {
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async (consulta: string): Promise<ResultadoBusca[]> => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { data, error } = await supabase.rpc("buscar_conhecimento", { p_org: orgId, p_consulta: consulta, p_limite: 6 });
      if (error) throw new Error(error.message);
      return (data ?? []) as ResultadoBusca[];
    },
  });
}
