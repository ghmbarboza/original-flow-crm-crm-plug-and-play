import { describe, expect, it } from "vitest";
import { statusDoCanal } from "./channelStatus";

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
    expect(status.detalhe).toContain("Configurações > Canais");
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
