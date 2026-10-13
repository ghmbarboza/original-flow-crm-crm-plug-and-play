import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useOrgId } from "@/hooks/useOrgId";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";

export interface MessageTemplate {
  id: string | null;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | string;
  category: string;
  language: string;
  body_text: string;
  /** Quantas variáveis o corpo espera. A campanha precisa entregar exatamente isso. */
  param_count: number;
}

export const TEMPLATE_STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Em revisão",
  REJECTED: "Rejeitado",
};

export const TEMPLATE_CATEGORY_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

/**
 * Templates de mensagem do provedor oficial configurado (Meta ou Zernio).
 *
 * A listagem vem direto do provedor a cada consulta — não há cópia no banco,
 * porque o status muda do lado da Meta durante a revisão e uma cópia local
 * ficaria desatualizada sem avisar.
 */
export function useMessageTemplates(enabled = true) {
  const orgId = useOrgId();
  // Só a API Oficial (Meta) e o Zernio têm templates; com Evolution a function
  // responde 400 por design, então nem chamamos (evitava 400 recorrente em
  // telas que listam templates sem olhar o canal, como Configurações > Agenda).
  const { data: canal } = useWhatsAppSetup();
  const provedorComTemplate = canal?.provider === "meta_official" || canal?.provider === "zernio";
  return useQuery({
    queryKey: ["message-templates", orgId],
    enabled: !!orgId && enabled && provedorComTemplate,
    queryFn: async (): Promise<{ provider: string; templates: MessageTemplate[] }> => {
      const { data, error } = await supabase.functions.invoke("message-templates", {
        body: { action: "list" },
      });
      if (error) throw await erroDeFunction(error, "Falha ao listar templates.");
      if (data?.error) throw new Error(data.error);
      return { provider: data?.provider ?? "", templates: data?.templates ?? [] };
    },
  });
}

export interface CreateTemplateInput {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  body_text: string;
  footer_text?: string;
  /** Um valor de exemplo por placeholder posicional do corpo ({{1}}, {{2}}, ...). */
  example_params: string[];
}

export function useCreateMessageTemplate() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const { data, error } = await supabase.functions.invoke("message-templates", {
        body: { action: "create", ...input },
      });
      if (error) throw await erroDeFunction(error, "Falha ao criar o template.");
      if (data?.error) throw new Error(data.error);
      return data.template as { name: string; status: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["message-templates", orgId] }),
  });
}

export interface SendTemplateInput {
  conversationId: string;
  templateName: string;
  templateLanguage: string;
  /** Um valor por variável do corpo, na ordem ({{1}}, {{2}}, ...). */
  params: string[];
}

/** Envia um template aprovado dentro de uma conversa (janela de 24h fechada). */
export function useSendTemplateMessage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendTemplateInput) => {
      const { data, error } = await supabase.functions.invoke("send-template-message", {
        body: {
          conversation_id: input.conversationId,
          template_name: input.templateName,
          template_language: input.templateLanguage,
          params: input.params,
        },
      });
      if (error) throw await erroDeFunction(error, "Falha ao enviar o template.");
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ["messages", input.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations", orgId] });
    },
  });
}
