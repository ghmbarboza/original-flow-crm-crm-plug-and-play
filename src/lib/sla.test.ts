import { describe, expect, it } from "vitest";
import {
  formatWaitingTime, slaApplies, slaStatus,
  type ConversationForSla, type SlaConfigLite,
} from "@/lib/sla";

const config: SlaConfigLite = {
  first_response_minutes: 30,
  resolution_hours: 24,
  alert_threshold_percent: 80,
  active_channels: ["whatsapp", "instagram"],
  is_active: true,
};

const agora = new Date("2026-07-31T12:00:00Z");

function conversa(partial: Partial<ConversationForSla>): ConversationForSla {
  return {
    status: "human_takeover",
    channel: "whatsapp",
    created_at: "2026-07-31T11:00:00Z",
    last_message_at: null,
    first_response_at: null,
    unread_count: 0,
    sla_breached: false,
    ...partial,
  };
}

describe("slaApplies", () => {
  it("respeita canal e is_active", () => {
    expect(slaApplies(config, "whatsapp")).toBe(true);
    expect(slaApplies(config, "telegram")).toBe(false);
    expect(slaApplies({ ...config, is_active: false }, "whatsapp")).toBe(false);
    expect(slaApplies(null, "whatsapp")).toBe(false);
  });

  it("sem active_channels configurado, vale o default whatsapp", () => {
    expect(slaApplies({ ...config, active_channels: null }, "whatsapp")).toBe(true);
    expect(slaApplies({ ...config, active_channels: null }, "instagram")).toBe(false);
  });
});

describe("slaStatus", () => {
  it("verde dentro do SLA", () => {
    const c = conversa({ unread_count: 1, last_message_at: "2026-07-31T11:50:00Z" });
    expect(slaStatus(c, config, agora)).toEqual({ level: "ok", waitingMinutes: 10 });
  });

  it("amarelo a partir do percentual de alerta", () => {
    const c = conversa({ unread_count: 1, last_message_at: "2026-07-31T11:35:00Z" });
    expect(slaStatus(c, config, agora)?.level).toBe("warning");
  });

  it("vermelho quando o limite estoura", () => {
    const c = conversa({ unread_count: 2, last_message_at: "2026-07-31T11:00:00Z" });
    expect(slaStatus(c, config, agora)).toEqual({ level: "breached", waitingMinutes: 60 });
  });

  it("sem não lidas e sem primeira resposta, conta desde a última mensagem", () => {
    const c = conversa({ unread_count: 0, first_response_at: null, last_message_at: "2026-07-31T11:40:00Z" });
    expect(slaStatus(c, config, agora)).toEqual({ level: "ok", waitingMinutes: 20 });
  });

  it("já respondida e sem não lidas: nada a mostrar", () => {
    const c = conversa({ unread_count: 0, first_response_at: "2026-07-31T11:10:00Z", last_message_at: "2026-07-31T11:10:00Z" });
    expect(slaStatus(c, config, agora)).toBeNull();
  });

  it("conversa fechada ou canal fora do SLA: nada a mostrar", () => {
    expect(slaStatus(conversa({ status: "closed", unread_count: 3, last_message_at: "2026-07-31T11:00:00Z" }), config, agora)).toBeNull();
    expect(slaStatus(conversa({ channel: "telegram", unread_count: 3, last_message_at: "2026-07-31T11:00:00Z" }), config, agora)).toBeNull();
  });
});

describe("formatWaitingTime", () => {
  it("formata minutos, horas e dias de espera", () => {
    expect(formatWaitingTime(7)).toBe("7min");
    expect(formatWaitingTime(65)).toBe("1h05");
    expect(formatWaitingTime(120)).toBe("2h");
    expect(formatWaitingTime(26 * 60)).toBe("26h");
  });
});
