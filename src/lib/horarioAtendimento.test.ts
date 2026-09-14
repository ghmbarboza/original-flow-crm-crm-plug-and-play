import { describe, expect, it } from "vitest";
import { horarioParaTela, horarioPadrao } from "./horarioAtendimento";

describe("horarioParaTela", () => {
  it("descarta as chaves legadas quando já existe configuração por dia (o caso real de 14/09)", () => {
    const misturado = {
      days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00",
      mon: { enabled: true, start: "09:00", end: "18:00" },
      sat: { enabled: false, start: "09:00", end: "18:00" },
    };
    const tela = horarioParaTela(misturado);
    expect(Object.keys(tela).sort()).toEqual(["fri", "mon", "sat", "sun", "thu", "tue", "wed"]);
    expect(tela).not.toHaveProperty("days");
    expect(tela).not.toHaveProperty("start");
    expect(tela.mon).toEqual({ enabled: true, start: "09:00", end: "18:00" });
  });

  it("traduz o formato legado para por dia, mostrando o horário que a IA usa", () => {
    const tela = horarioParaTela({ days: [1, 2, 3, 4, 5, 6], start: "08:00", end: "20:00" });
    expect(tela.mon).toEqual({ enabled: true, start: "08:00", end: "20:00" });
    expect(tela.sat).toEqual({ enabled: true, start: "08:00", end: "20:00" });
    expect(tela.sun).toEqual({ enabled: false, start: "08:00", end: "20:00" });
  });

  it("vazio ou inválido vira o padrão", () => {
    expect(horarioParaTela({})).toEqual(horarioPadrao());
    expect(horarioParaTela(null)).toEqual(horarioPadrao());
    expect(horarioParaTela("lixo")).toEqual(horarioPadrao());
  });
});
