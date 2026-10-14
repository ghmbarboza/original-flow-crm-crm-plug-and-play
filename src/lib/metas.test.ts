import { describe, expect, it } from "vitest";
import {
  deslocarPeriodo, dentroDoPeriodo, periodoQueContem, periodosSeCruzam, progresso, realizado, rotuloPeriodo,
  type DadosMetas, type MetaParaCalculo,
} from "@/lib/metas";

describe("períodos", () => {
  it("monta mês, trimestre, semestre e ano a partir de um dia", () => {
    expect(periodoQueContem("mes", "2026-02-15")).toEqual({ tipo: "mes", inicio: "2026-02-01", fim: "2026-02-28" });
    expect(periodoQueContem("trimestre", "2026-08-20")).toMatchObject({ inicio: "2026-07-01", fim: "2026-09-30" });
    expect(periodoQueContem("semestre", "2026-03-01")).toMatchObject({ inicio: "2026-01-01", fim: "2026-06-30" });
    expect(periodoQueContem("ano", "2028-06-01")).toMatchObject({ inicio: "2028-01-01", fim: "2028-12-31" });
  });

  it("semana vai de segunda a domingo, inclusive na virada do mês", () => {
    // 14/10/2026 é quarta-feira.
    expect(periodoQueContem("semana", "2026-10-14")).toMatchObject({ inicio: "2026-10-12", fim: "2026-10-18" });
    expect(periodoQueContem("semana", "2026-11-01")).toMatchObject({ inicio: "2026-10-26", fim: "2026-11-01" });
  });

  it("anda para o próximo e para o anterior", () => {
    expect(deslocarPeriodo(periodoQueContem("mes", "2026-12-10"), 1)).toMatchObject({ inicio: "2027-01-01", fim: "2027-01-31" });
    expect(deslocarPeriodo(periodoQueContem("trimestre", "2026-01-10"), -1)).toMatchObject({ inicio: "2025-10-01", fim: "2025-12-31" });
  });

  it("dá nome curto ao período", () => {
    expect(rotuloPeriodo(periodoQueContem("mes", "2026-10-01"))).toBe("out/2026");
    expect(rotuloPeriodo(periodoQueContem("trimestre", "2026-10-01"))).toBe("4º tri/2026");
    expect(rotuloPeriodo({ tipo: "personalizado", inicio: "2026-10-06", fim: "2026-10-12" })).toBe("06/10 a 12/10/2026");
  });

  it("cruza períodos e respeita o fuso de Brasília", () => {
    expect(periodosSeCruzam({ inicio: "2026-10-01", fim: "2026-10-31" }, { inicio: "2026-10-31", fim: "2026-11-30" })).toBe(true);
    expect(periodosSeCruzam({ inicio: "2026-10-01", fim: "2026-10-31" }, { inicio: "2026-11-01", fim: "2026-11-30" })).toBe(false);
    // 01/11 às 01h UTC ainda é 31/10 em Brasília.
    expect(dentroDoPeriodo("2026-11-01T01:00:00Z", { inicio: "2026-10-01", fim: "2026-10-31" })).toBe(true);
  });
});

const OUT = { inicio: "2026-10-01", fim: "2026-10-31" };
const dados: DadosMetas = {
  negocios: [
    { id: "n1", value: 1000, owner_id: "ana", status: "won", contact_id: "c1", created_at: "2026-09-20T12:00:00Z", closed_at: "2026-10-05T12:00:00Z", pipeline_id: "vendas", origem: "site" },
    { id: "n2", value: 3000, owner_id: "ana", status: "won", contact_id: "c2", created_at: "2026-10-02T12:00:00Z", closed_at: "2026-10-10T12:00:00Z", pipeline_id: "pos", origem: "indicacao" },
    { id: "n3", value: 500, owner_id: "beto", status: "lost", contact_id: "c3", created_at: "2026-10-03T12:00:00Z", closed_at: "2026-10-11T12:00:00Z", pipeline_id: "vendas", origem: "site" },
    { id: "n4", value: 9000, owner_id: "beto", status: "won", contact_id: null, created_at: "2026-08-01T12:00:00Z", closed_at: "2026-09-30T12:00:00Z", pipeline_id: "vendas", origem: null },
    { id: "n5", value: 200, owner_id: "beto", status: "open", contact_id: "c4", created_at: "2026-10-20T12:00:00Z", closed_at: null, pipeline_id: "vendas", origem: "site" },
  ],
  contatos: [
    { id: "c2", owner_id: "ana", created_at: "2026-10-01T12:00:00Z", source: "indicacao" },
    { id: "c3", owner_id: "beto", created_at: "2026-10-02T12:00:00Z", source: "site" },
    { id: "c4", owner_id: "beto", created_at: "2026-10-03T12:00:00Z", source: "site" },
    { id: "c5", owner_id: "beto", created_at: "2026-10-04T12:00:00Z", source: "site" },
  ],
  atividades: [
    { user_id: "ana", type: "call", created_at: "2026-10-01T12:00:00Z" },
    { user_id: "ana", type: "meeting", created_at: "2026-10-02T12:00:00Z" },
    { user_id: "ana", type: "stage_change", created_at: "2026-10-02T12:00:00Z" },
    { user_id: "ana", type: "note", created_at: "2026-10-02T12:00:00Z" },
  ],
  conversas: [
    { assigned_to: "ana", first_response_minutes: 30, created_at: "2026-10-01T12:00:00Z" },
    { assigned_to: "beto", first_response_minutes: 90, created_at: "2026-10-01T12:00:00Z" },
  ],
};
const meta = (m: Partial<MetaParaCalculo>): MetaParaCalculo => ({ metrica: "revenue", responsavel: null, periodo: OUT, filtros: {}, ...m });

describe("realizado", () => {
  it("receita conta o dia do ganho, não o da criação, e respeita o responsável", () => {
    expect(realizado(meta({}), dados)).toBe(4000);
    expect(realizado(meta({ responsavel: "beto" }), dados)).toBe(0);
  });

  it("filtra por funil e por origem", () => {
    expect(realizado(meta({ filtros: { pipeline_id: "pos" } }), dados)).toBe(3000);
    expect(realizado(meta({ filtros: { origem: "site" } }), dados)).toBe(1000);
  });

  it("ticket médio, criados e ganhos acima de um valor", () => {
    expect(realizado(meta({ metrica: "avg_ticket" }), dados)).toBe(2000);
    expect(realizado(meta({ metrica: "deals_created" }), dados)).toBe(3);
    expect(realizado(meta({ metrica: "min_deal_value", filtros: { valor_minimo: 2000 } }), dados)).toBe(1);
  });

  it("atividades não contam o histórico automático nem anotação, salvo se escolhidas", () => {
    expect(realizado(meta({ metrica: "activities" }), dados)).toBe(2);
    expect(realizado(meta({ metrica: "activities", filtros: { tipos_atividade: ["note"] } }), dados)).toBe(1);
  });

  it("taxa de ganho entre os fechados do período", () => {
    // ganhos: n1, n2; perdido: n3 → 2/3
    expect(realizado(meta({ metrica: "conversion_rate" }), dados)).toBe(66.7);
  });

  it("conversão de lead em negócio entre os leads do período", () => {
    // leads: c2, c3, c4, c5; com negócio: c2, c3, c4 → 75%
    expect(realizado(meta({ metrica: "lead_to_deal" }), dados)).toBe(75);
    expect(realizado(meta({ metrica: "lead_to_deal", responsavel: "beto" }), dados)).toBe(66.7);
  });

  it("tempo médio de primeira resposta em horas", () => {
    expect(realizado(meta({ metrica: "avg_response_time" }), dados)).toBe(1);
  });

  it("sem base para medir é null, não zero", () => {
    expect(realizado(meta({ metrica: "avg_response_time", responsavel: "carla" }), dados)).toBeNull();
    expect(realizado(meta({ metrica: "conversion_rate", responsavel: "carla" }), dados)).toBeNull();
    expect(realizado(meta({ metrica: "avg_ticket", responsavel: "carla" }), dados)).toBeNull();
    expect(realizado(meta({ metrica: "revenue", responsavel: "carla" }), dados)).toBe(0);
  });
});

describe("progresso", () => {
  it("normal: proporção do alvo, limitada a 100", () => {
    expect(progresso("revenue", 8000, 4000)).toEqual({ percentual: 50, atingiu: false, semDados: false });
    expect(progresso("revenue", 2000, 4000)).toEqual({ percentual: 100, atingiu: true, semDados: false });
    // Quase lá não aparece como 100%.
    expect(progresso("revenue", 1000, 996)).toEqual({ percentual: 99, atingiu: false, semDados: false });
  });

  it("menor é melhor: abaixo do alvo bate a meta", () => {
    expect(progresso("avg_response_time", 2, 1)).toEqual({ percentual: 100, atingiu: true, semDados: false });
    expect(progresso("avg_response_time", 1, 4)).toEqual({ percentual: 25, atingiu: false, semDados: false });
  });

  it("alvo zero não divide por zero", () => {
    expect(progresso("deals", 0, 3)).toEqual({ percentual: 0, atingiu: false, semDados: false });
  });

  it("sem dados nunca conta como meta batida, nem em menor é melhor", () => {
    expect(progresso("avg_response_time", 2, null)).toEqual({ percentual: 0, atingiu: false, semDados: true });
  });
});
