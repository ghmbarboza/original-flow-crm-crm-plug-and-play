import { describe, expect, it } from "vitest";
import { ehPendente, filtrarModoFoco } from "./useModoFoco";
import type { Conversation } from "./useConversations";

const conversa = (over: Partial<Conversation>): Conversation =>
  ({
    id: Math.random().toString(36).slice(2),
    status: "ai_active",
    unread_count: 0,
    assigned_to: null,
    ...over,
  }) as Conversation;

describe("ehPendente", () => {
  it("pendente = assumida por humano E com não lidas", () => {
    expect(ehPendente(conversa({ status: "human_takeover", unread_count: 2 }))).toBe(true);
    expect(ehPendente(conversa({ status: "human_takeover", unread_count: 0 }))).toBe(false);
    expect(ehPendente(conversa({ status: "ai_active", unread_count: 5 }))).toBe(false);
  });
});

describe("filtrarModoFoco", () => {
  const eu = "agente-1";
  const aMinha = conversa({ id: "a", assigned_to: eu });
  const bPendente = conversa({ id: "b", assigned_to: eu, status: "human_takeover", unread_count: 1 });
  const cDeOutro = conversa({ id: "c", assigned_to: "agente-2", status: "human_takeover", unread_count: 3 });
  const dSemDono = conversa({ id: "d", assigned_to: null });

  it("só devolve as conversas do agente logado", () => {
    const r = filtrarModoFoco([aMinha, bPendente, cDeOutro, dSemDono], eu);
    expect(r.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("pendentes vêm primeiro, ordem relativa preservada", () => {
    const outraPendente = conversa({ id: "e", assigned_to: eu, status: "human_takeover", unread_count: 9 });
    const r = filtrarModoFoco([aMinha, bPendente, outraPendente], eu);
    expect(r.map((c) => c.id)).toEqual(["b", "e", "a"]);
  });

  it("sem usuário logado, nada aparece (nunca vaza conversa dos outros)", () => {
    expect(filtrarModoFoco([aMinha, cDeOutro, dSemDono], undefined)).toHaveLength(0);
  });
});
