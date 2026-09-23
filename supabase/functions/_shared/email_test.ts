// deno test supabase/functions/_shared/email_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escolherProvedor, montarRemetente } from "./email.ts";

const resend = { provider: "resend" as const, from_name: "Empresa", from_email: "oi@empresa.com", reply_to: null, api_base: null };
const gmail = { ...resend, provider: "gmail" as const };

Deno.test("Resend configurado com chave e remetente vence", () => {
  assertEquals(escolherProvedor(resend, true, true), "resend");
});

Deno.test("Resend sem chave cai para o Gmail quando há conexão", () => {
  assertEquals(escolherProvedor(resend, false, true), "gmail");
});

Deno.test("Resend sem remetente mas com chave e sem Gmail ainda envia pelo Resend", () => {
  assertEquals(escolherProvedor({ ...resend, from_email: null }, true, false), "resend");
});

Deno.test("Gmail configurado sem conexão não envia", () => {
  assertEquals(escolherProvedor(gmail, true, false), null);
});

Deno.test("sem configuração usa o Gmail se houver conexão", () => {
  assertEquals(escolherProvedor(null, false, true), "gmail");
  assertEquals(escolherProvedor(null, false, false), null);
});

Deno.test("remetente com e sem nome", () => {
  assertEquals(montarRemetente("Empresa X", "oi@x.com"), "Empresa X <oi@x.com>");
  assertEquals(montarRemetente("  ", "oi@x.com"), "oi@x.com");
});
