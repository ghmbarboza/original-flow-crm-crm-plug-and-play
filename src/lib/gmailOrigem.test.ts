import { describe, it, expect } from "vitest";
import { origemDoApp } from "../../supabase/functions/_shared/origem";

describe("origem do app na volta do login do Gmail", () => {
  it("aceita https e devolve só a origem", () => {
    expect(origemDoApp("https://crm.cliente.com.br/inbox?x=1")).toBe("https://crm.cliente.com.br");
    expect(origemDoApp("https://id-preview--abc.lovable.app")).toBe("https://id-preview--abc.lovable.app");
  });

  it("aceita http só em localhost", () => {
    expect(origemDoApp("http://localhost:8080")).toBe("http://localhost:8080");
    expect(origemDoApp("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
    expect(origemDoApp("http://crm.cliente.com.br")).toBeNull();
  });

  it("recusa o que não é endereço web", () => {
    expect(origemDoApp("javascript:alert(1)")).toBeNull();
    expect(origemDoApp("//evil.com")).toBeNull();
    expect(origemDoApp("")).toBeNull();
    expect(origemDoApp(undefined)).toBeNull();
    expect(origemDoApp(42)).toBeNull();
  });
});
