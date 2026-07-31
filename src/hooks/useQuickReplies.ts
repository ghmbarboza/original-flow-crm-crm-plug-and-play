import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type QuickReply = Database["public"]["Tables"]["quick_replies"]["Row"];
export type QuickReplyInsert = Database["public"]["Tables"]["quick_replies"]["Insert"];

/**
 * Respostas rápidas do inbox: o agente digita `/` no composer e escolhe uma
 * resposta pré-definida da organização. O CRUD mora em Configurações >
 * Atendimento; aqui ficam as queries e a lógica pura (filtro e variáveis),
 * separada para ser testável sem UI.
 */

/** Normaliza um atalho digitado: sem `/`, minúsculo, sem espaços. */
export function normalizarAtalho(s: string): string {
  return s.replace(/^\//, "").trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Filtra respostas pelo que foi digitado depois da `/` — casa por prefixo do
 * atalho primeiro (é o que o agente memoriza), depois por ocorrência no título.
 */
export function filtrarRespostas(respostas: QuickReply[], busca: string): QuickReply[] {
  const termo = normalizarAtalho(busca);
  if (!termo) return respostas;
  const porAtalho = respostas.filter((r) => r.shortcut.toLowerCase().startsWith(termo));
  const porTitulo = respostas.filter(
    (r) => !r.shortcut.toLowerCase().startsWith(termo) && r.title.toLowerCase().includes(termo),
  );
  return [...porAtalho, ...porTitulo];
}

/**
 * Substitui variáveis `{{chave}}` pelos valores informados (chaves com ponto,
 * ex.: `contact.first_name`). Variável sem valor vira string vazia — é melhor
 * "Olá !" visível na revisão do agente do que `{{contact.first_name}}` chegando
 * ao cliente.
 */
export function aplicarVariaveis(mensagem: string, valores: Record<string, string | null | undefined>): string {
  return mensagem.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, chave: string) => {
    const v = valores[chave];
    return v ?? "";
  });
}

export function useQuickReplies() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["quick-replies", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<QuickReply[]> => {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("*")
        .eq("org_id", orgId!)
        .order("shortcut");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveQuickReply() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; shortcut: string; title: string; message: string; category?: string | null; is_active?: boolean }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const shortcut = normalizarAtalho(input.shortcut);
      if (!shortcut) throw new Error("Informe o atalho da resposta.");
      if (input.id) {
        const { error } = await supabase
          .from("quick_replies")
          .update({
            shortcut,
            title: input.title,
            message: input.message,
            category: input.category ?? null,
            is_active: input.is_active ?? true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase.from("quick_replies").insert({
          org_id: orgId,
          shortcut,
          title: input.title,
          message: input.message,
          category: input.category ?? null,
          created_by: auth.user?.id ?? null,
        });
        if (error) {
          // 23505 = unique_violation em (org_id, shortcut): erro dito em português.
          if (error.code === "23505") throw new Error(`Já existe uma resposta com o atalho /${shortcut}.`);
          throw error;
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quick-replies", orgId] }),
  });
}

export function useDeleteQuickReply() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quick-replies", orgId] }),
  });
}

/**
 * Importa linhas de um CSV (colunas: shortcut, title, message, category).
 * Upsert por (org, shortcut): reimportar a mesma planilha atualiza em vez de
 * falhar — mesma razão do ON CONFLICT do seed da Biblioteca.
 */
export function useImportQuickReplies() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linhas: { shortcut: string; title: string; message: string; category?: string | null }[]) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { data: auth } = await supabase.auth.getUser();
      const validas = linhas
        .map((l) => ({
          org_id: orgId,
          shortcut: normalizarAtalho(l.shortcut),
          title: l.title.trim(),
          message: l.message.trim(),
          category: l.category?.trim() || null,
          created_by: auth.user?.id ?? null,
        }))
        .filter((l) => l.shortcut && l.title && l.message);
      if (validas.length === 0) throw new Error("Nenhuma linha válida — o CSV precisa de shortcut, title e message.");
      const { error } = await supabase
        .from("quick_replies")
        .upsert(validas, { onConflict: "org_id,shortcut" });
      if (error) throw error;
      return { importadas: validas.length, ignoradas: linhas.length - validas.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quick-replies", orgId] }),
  });
}
