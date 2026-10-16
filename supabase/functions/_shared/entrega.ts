// Envio de texto pelo canal da conversa (Evolution, Meta ou Zernio), sem
// áudio. Usado pela API pública e por quem precisar mandar texto numa conversa
// já existente. A ai-reply mantém a própria entrega porque trata áudio.
//
// A conta que responde é a conta pela qual a conversa entrou (ver _shared/canal.ts).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { contaDaConversa, enviarTextoPelaConta } from "./canal.ts";

export interface ConversaParaEnvio {
  id: string;
  org_id: string;
  provider: string;
  phone_number: string;
  channel?: string | null;
  provider_conversation_id?: string | null;
  channel_account_id?: string | null;
  is_demo?: boolean | null;
}

export interface ResultadoEntrega {
  ok: boolean;
  providerMessageId: string | null;
  motivo?: string;
}

export async function entregarTexto(admin: SupabaseClient, conversa: ConversaParaEnvio, texto: string): Promise<ResultadoEntrega> {
  if (conversa.is_demo) return { ok: true, providerMessageId: `demo-${crypto.randomUUID()}` };

  const conta = await contaDaConversa(admin, conversa);
  if (!conta) return { ok: false, providerMessageId: null, motivo: `nenhuma conta ativa do provedor ${conversa.provider}` };
  return enviarTextoPelaConta(conta, conversa, texto);
}
