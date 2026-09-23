import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { POLITICA_PADRAO, evidenciaConfere, instanteNoFuso, partesNoFuso, validarPedido } from "./agenda.ts";

const FUSO = "America/Sao_Paulo";

Deno.test("instanteNoFuso converte hora local de São Paulo para UTC", () => {
  const d = instanteNoFuso("2026-10-06", "09:30", FUSO)!;
  assertEquals(d.toISOString(), "2026-10-06T12:30:00.000Z");
  const p = partesNoFuso(d, FUSO);
  assertEquals([p.hora, p.minuto, p.diaSemana], [9, 30, 2]);
  assertEquals(instanteNoFuso("2026-13-01", "09:00", FUSO), null);
  assertEquals(instanteNoFuso("2026-02-30", "09:00", FUSO), null);
});

Deno.test("validarPedido aplica antecedência, dias, expediente e duração", () => {
  const agora = new Date("2026-10-05T12:00:00.000Z"); // segunda 09:00 em SP
  const ok = validarPedido(POLITICA_PADRAO, FUSO, "2026-10-06", "10:00", null, agora);
  assertEquals(ok.ok, true);
  assertEquals(validarPedido(POLITICA_PADRAO, FUSO, "2026-10-05", "09:30", null, agora).ok ? "" : (validarPedido(POLITICA_PADRAO, FUSO, "2026-10-05", "09:30", null, agora) as { codigo: string }).codigo, "minimum_notice");
  assertEquals((validarPedido(POLITICA_PADRAO, FUSO, "2026-10-04", "10:00", null, agora) as { codigo: string }).codigo, "date_in_past");
  assertEquals((validarPedido(POLITICA_PADRAO, FUSO, "2026-10-10", "10:00", null, agora) as { codigo: string }).codigo, "weekday_not_allowed");
  assertEquals((validarPedido(POLITICA_PADRAO, FUSO, "2026-10-06", "17:45", null, agora) as { codigo: string }).codigo, "outside_business_hours");
  assertEquals((validarPedido(POLITICA_PADRAO, FUSO, "2026-10-06", "10:00", 5, agora) as { codigo: string }).codigo, "invalid_duration");
  assertEquals((validarPedido(POLITICA_PADRAO, FUSO, "2027-01-06", "10:00", null, agora) as { codigo: string }).codigo, "maximum_advance");
  assertEquals((validarPedido(POLITICA_PADRAO, FUSO, "amanhã", "10h", null, agora) as { codigo: string }).codigo, "invalid_date_time");
});

Deno.test("evidência literal precisa estar nas últimas mensagens do lead, sem acento e sem maiúscula", () => {
  const historico = ["oi, quero saber preços", "Pode ser terça às 10h? Fechado então, terça 10h."];
  assertEquals(evidenciaConfere("fechado então, terça 10h", historico), true);
  assertEquals(evidenciaConfere("FECHADO ENTAO, TERCA 10H", historico), true);
  assertEquals(evidenciaConfere("quinta às 14h", historico), false);
  assertEquals(evidenciaConfere("oi", historico), false);
  assertEquals(evidenciaConfere("", historico), false);
});
