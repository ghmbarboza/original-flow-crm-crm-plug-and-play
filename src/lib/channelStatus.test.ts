import { describe, expect, it } from "vitest";
import { canaisAtivos, statusDoCanal, type ContaParaStatus } from "./channelStatus";

/** Só os campos que o helper lê — o resto da conta não interessa ao status. */
const conta = (estado: string, extra: Partial<ContaParaStatus> = {}): ContaParaStatus => ({
  estado,
  is_active: true,
  channel: "whatsapp",
  ...extra,
});

describe("statusDoCanal", () => {
  it("é 'conectado' com uma conta conectada", () => {
    expect(statusDoCanal([conta("conectada")]).estado).toBe("conectado");
  });

  it("é 'aguardando_pareamento' com a Evolution em connecting (o bug do print)", () => {
    const status = statusDoCanal([conta("aguardando")]);

    expect(status.estado).toBe("aguardando_pareamento");
    expect(status.label).toBe("Aguardando pareamento");
    expect(status.detalhe).toContain("Configurações > Integrações > Canais");
  });

  it("basta um número conectado entre vários", () => {
    expect(statusDoCanal([conta("aguardando"), conta("conectada"), conta("desconectada")]).estado).toBe("conectado");
  });

  it("conta desligada não conta, nem quando o provedor diz conectada", () => {
    expect(statusDoCanal([conta("conectada", { is_active: false })]).estado).toBe("nao_conectado");
    expect(statusDoCanal([conta("conectada", { is_active: false }), conta("aguardando")]).estado).toBe(
      "aguardando_pareamento",
    );
  });

  it("é 'nao_conectado' quando nada foi configurado", () => {
    expect(statusDoCanal(null).estado).toBe("nao_conectado");
    expect(statusDoCanal([]).label).toBe("Não conectado");
  });
});

describe("canaisAtivos", () => {
  it("retorna só whatsapp com Evolution pareada", () => {
    expect(canaisAtivos([conta("conectada")])).toEqual(["whatsapp"]);
  });

  it("não retorna nada com Evolution em connecting", () => {
    expect(canaisAtivos([conta("aguardando")])).toEqual([]);
  });

  it("retorna os canais das contas Zernio efetivamente conectadas, sem repetir", () => {
    const canais = canaisAtivos([
      conta("conectada", { channel: "instagram" }),
      conta("aguardando", { channel: "reddit" }),
      conta("conectada", { channel: "whatsapp" }),
      conta("conectada", { channel: "whatsapp" }),
    ]);
    expect(canais.sort()).toEqual(["instagram", "whatsapp"]);
  });

  it("ignora contas desligadas", () => {
    expect(canaisAtivos([conta("conectada", { channel: "instagram", is_active: false })])).toEqual([]);
  });
});
