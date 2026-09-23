// deno test supabase/functions/_shared/horario_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dentroDoHorario, proximaAbertura } from "./horario.ts";

const TZ = "America/Sao_Paulo";
const porDia = {
  mon: { enabled: true, start: "08:00", end: "18:00" },
  tue: { enabled: true, start: "08:00", end: "18:00" },
  wed: { enabled: true, start: "08:00", end: "18:00" },
  thu: { enabled: true, start: "08:00", end: "18:00" },
  fri: { enabled: true, start: "08:00", end: "18:00" },
  sat: { enabled: false, start: "08:00", end: "12:00" },
  sun: { enabled: false, start: "08:00", end: "12:00" },
};

Deno.test("sem configuração, atende sempre", () => {
  assertEquals(dentroDoHorario({}, TZ), true);
  assertEquals(dentroDoHorario(null, TZ), true);
});

Deno.test("terça 22h (BRT) abre na quarta às 8h (11:00Z)", () => {
  // 2026-09-22 é terça; 22:00 em São Paulo = 01:00Z de 23/09.
  const agora = new Date("2026-09-23T01:00:00Z");
  const abre = proximaAbertura(porDia, TZ, agora);
  assertEquals(abre.toISOString(), "2026-09-23T11:00:00.000Z");
});

Deno.test("sexta 19h pula o fim de semana e abre segunda às 8h", () => {
  // 2026-09-25 é sexta; 19:00 BRT = 22:00Z.
  const agora = new Date("2026-09-25T22:00:00Z");
  const abre = proximaAbertura(porDia, TZ, agora);
  assertEquals(abre.toISOString(), "2026-09-28T11:00:00.000Z");
});

Deno.test("quarta 6h abre no mesmo dia às 8h", () => {
  // 2026-09-23 é quarta; 06:00 BRT = 09:00Z.
  const agora = new Date("2026-09-23T09:00:00Z");
  const abre = proximaAbertura(porDia, TZ, agora);
  assertEquals(abre.toISOString(), "2026-09-23T11:00:00.000Z");
});

Deno.test("formato legado (days + start/end) também agenda", () => {
  const legado = { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };
  // sábado 26/09 10:00 BRT = 13:00Z → segunda 28/09 09:00 BRT = 12:00Z
  const agora = new Date("2026-09-26T13:00:00Z");
  assertEquals(proximaAbertura(legado, TZ, agora).toISOString(), "2026-09-28T12:00:00.000Z");
});
