import { describe, expect, it } from "vitest";
import { avatarAindaValido } from "./avatar";

describe("avatarAindaValido", () => {
  const agora = 1_800_000_000_000; // ms
  it("aceita URL sem prazo", () => {
    expect(avatarAindaValido("https://cdn.exemplo.com/foto.jpg", agora)).toBe(true);
  });
  it("aceita URL cujo prazo ainda não venceu", () => {
    const oe = (agora / 1000 + 3600).toString(16);
    expect(avatarAindaValido(`https://pps.whatsapp.net/v/x.jpg?ccb=1&oe=${oe}`, agora)).toBe(true);
  });
  it("recusa URL vencida", () => {
    const oe = (agora / 1000 - 60).toString(16);
    expect(avatarAindaValido(`https://pps.whatsapp.net/v/x.jpg?oe=${oe}`, agora)).toBe(false);
  });
  it("recusa vazio e URL inválida", () => {
    expect(avatarAindaValido(null, agora)).toBe(false);
    expect(avatarAindaValido("isto não é url", agora)).toBe(false);
  });
});
