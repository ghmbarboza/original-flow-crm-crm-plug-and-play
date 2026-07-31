import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { type Conversation } from "@/hooks/useConversations";

/**
 * Modo foco do inbox (Parte 4 do Sprint 10A): o agente vê só o que é dele.
 *
 * Estado persistido em localStorage POR USUÁRIO — dois agentes na mesma
 * máquina não herdam o modo um do outro. A preferência é do dispositivo
 * (não sincroniza entre aparelhos), o que para um toggle de sessão de
 * trabalho é o comportamento esperado.
 */
export function useModoFoco(): [boolean, (ativo: boolean) => void] {
  const { user } = useAuth();
  const chave = `via-modo-foco:${user?.id ?? "anon"}`;

  const [ativo, setAtivoState] = useState(() => {
    try {
      return localStorage.getItem(chave) === "1";
    } catch {
      return false; // localStorage indisponível (ex.: modo privado) = modo normal
    }
  });

  const setAtivo = useCallback((v: boolean) => {
    setAtivoState(v);
    try {
      localStorage.setItem(chave, v ? "1" : "0");
    } catch {
      // sem persistência, o toggle ainda funciona na sessão
    }
  }, [chave]);

  return [ativo, setAtivo];
}

/** Conversa pendente para o agente: assumida por humano e com não lidas. */
export function ehPendente(c: Conversation): boolean {
  return c.status === "human_takeover" && c.unread_count > 0;
}

/**
 * Recorte do modo foco: só conversas atribuídas ao agente, pendentes primeiro.
 * A ordem relativa dentro de cada grupo é preservada (a lista já vem por
 * última mensagem, mais recente primeiro).
 */
export function filtrarModoFoco(conversas: Conversation[], userId: string | undefined): Conversation[] {
  const minhas = conversas.filter((c) => c.assigned_to === userId);
  return [...minhas.filter(ehPendente), ...minhas.filter((c) => !ehPendente(c))];
}
