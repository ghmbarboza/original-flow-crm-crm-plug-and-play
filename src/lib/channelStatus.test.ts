import { describe, expect, it } from "vitest";
import { canaisAtivos, statusDoCanal } from "./channelStatus";

/** Só os campos que o helper lê — o resto da Row não interessa ao status. */
const evolution = (status: string) => ({ status }) as never;
const meta = (v: Partial<{ webhook_verified: boolean; is_active: boolean }>) => v as never;
const zernio = (status: string) => ({ status }) as never;

describe("statusDoCanal", () => {
  it("é 'conectado' com a instância Evolution pareada", () => {
    expect(statusDoCanal({ evolution: evolution("connected") }).estado).toBe("conectado");
  });

  it("é 'aguardando_pareamento' com a Evolution em connecting (o bug do print)", () => {
    const status = statusDoCanal({ evolution: evolution("connecting") });

    expect(status.estado).toBe("aguardando_pareamento");
    expect(status.label).toBe("Aguardando pareamento");
    expect(status.detalhe).toContain("Configurações > Integrações > Canais");
  });

  it("aceita Meta apenas com webhook verificado e canal ativo", () => {
    expect(statusDoCanal({ meta: meta({ webhook_verified: true }) }).estado).toBe("conectado");
    expect(statusDoCanal({ meta: meta({ webhook_verified: true, is_active: false }) }).estado).toBe(
      "aguardando_pareamento",
    );
    expect(statusDoCanal({ meta: meta({ webhook_verified: false }) }).estado).toBe(
      "aguardando_pareamento",
    );
  });

  it("aceita Zernio conectada ou ativa", () => {
    expect(statusDoCanal({ zernio: zernio("connected") }).estado).toBe("conectado");
    expect(statusDoCanal({ zernio: zernio("active") }).estado).toBe("conectado");
    expect(statusDoCanal({ zernio: zernio("pending") }).estado).toBe("aguardando_pareamento");
  });

  it("é 'nao_conectado' quando nada foi configurado", () => {
    expect(statusDoCanal(null).estado).toBe("nao_conectado");
    expect(statusDoCanal({}).label).toBe("Não conectado");
  });
});

describe("canaisAtivos", () => {
  it("retorna só whatsapp com Evolution pareada", () => {
    expect(canaisAtivos({ evolution: evolution("connected") })).toEqual(["whatsapp"]);
  });

  it("não retorna nada com Evolution em connecting", () => {
    expect(canaisAtivos({ evolution: evolution("connecting") })).toEqual([]);
  });

  it("retorna os canais Zernio efetivamente conectados", () => {
    const canais = canaisAtivos({ zernio: zernio("active") }, [
      { platform: "instagram", isActive: true },
      { platform: "reddit", isActive: false },
      { platform: "whatsapp", isActive: true },
    ]);
    expect(canais.sort()).toEqual(["instagram", "whatsapp"]);
  });

  it("ignora contas quando o Zernio não está ligado", () => {
    expect(canaisAtivos({ zernio: zernio("pending") }, [{ platform: "instagram", isActive: true }])).toEqual([]);
  });
});
