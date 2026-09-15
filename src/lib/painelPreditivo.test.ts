import { describe, it, expect } from "vitest";
import {
  EVENTOS_PAINEL, corpoPainelPreditivo, etapaDoPainel, origemDoPainel,
} from "../../supabase/functions/_shared/painelPreditivo";
import { WEBHOOK_EVENTOS_PAINEL } from "@/hooks/useWebhooks";

const envelope = (event: string, deal: Record<string, unknown>, contact: Record<string, unknown> = {}) => ({
  id: "evt-1", event, org_id: "org-1", occurred_at: "2026-09-15T12:00:00.000Z", source: "flowcrm",
  data: { deal, contact },
});

describe("formato do Painel Preditivo de Metas", () => {
  it("converte negócio criado no corpo que o receive-crm-webhook espera", () => {
    const corpo = corpoPainelPreditivo(envelope(
      "deal.created",
      {
        id: "deal-1", title: "Apto Jardins", value: 850000, status: "open",
        stage: { id: "s1", name: "Visita agendada", win_probability: 30 },
        owner: { id: "u1", name: "Ana", email: "ana@imob.com" },
        custom_fields: { segment: "alto_padrao" },
      },
      { source: "whatsapp", custom_fields: { gender: "feminino" } },
    ));
    expect(corpo).toEqual({
      event_type: "deal.created",
      deal: {
        external_id: "deal-1", title: "Apto Jardins", stage: "visita", value: 850000,
        lead_origin: "whatsapp", user_email: "ana@imob.com", client_gender: "feminino", segment: "alto_padrao",
      },
    });
  });

  it("negócio ganho vira deal.closed em fechamento com data", () => {
    const corpo = corpoPainelPreditivo(envelope("deal.won", {
      id: "d", title: "t", value: "1200.5", status: "won", updated_at: "2026-09-14T10:00:00Z",
      stage: { name: "Negociação" },
    }));
    expect(corpo?.event_type).toBe("deal.closed");
    expect(corpo?.deal).toMatchObject({ stage: "fechamento", value: 1200.5, closed_at: "2026-09-14T10:00:00Z", lead_origin: "outro" });
  });

  it("não manda perdido, contato nem mensagem", () => {
    expect(corpoPainelPreditivo(envelope("deal.lost", { id: "d" }))).toBeNull();
    expect(corpoPainelPreditivo({ event: "contact.created", data: {} })).toBeNull();
    expect(corpoPainelPreditivo({ event: "message.received", data: {} })).toBeNull();
  });

  it("etapa pelo nome e, sem nome reconhecível, pela probabilidade", () => {
    expect(etapaDoPainel({ stage: { name: "Novo lead" } })).toBe("lead");
    expect(etapaDoPainel({ stage: { name: "Qualificação" } })).toBe("contato");
    expect(etapaDoPainel({ stage: { name: "Proposta enviada" } })).toBe("proposta");
    expect(etapaDoPainel({ stage: { name: "Etapa 3", win_probability: 70 } })).toBe("proposta");
    expect(etapaDoPainel({ stage: { name: "Etapa 2", win_probability: 20 } })).toBe("contato");
    expect(etapaDoPainel({ stage: { name: "X" } })).toBe("lead");
  });

  it("origem no vocabulário do painel", () => {
    expect(origemDoPainel("WhatsApp")).toBe("whatsapp");
    expect(origemDoPainel("indicação")).toBe("indicacao");
    expect(origemDoPainel("website")).toBe("portal");
    expect(origemDoPainel("instagram")).toBe("outro");
    expect(origemDoPainel(null)).toBe("outro");
  });

  it("a tela oferece exatamente os eventos que o conversor aceita", () => {
    expect([...WEBHOOK_EVENTOS_PAINEL]).toEqual([...EVENTOS_PAINEL]);
  });
});
