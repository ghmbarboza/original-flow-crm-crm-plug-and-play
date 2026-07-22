import { test, expect } from "@playwright/test";
import { supabaseCtx, seedWhatsAppInbox } from "./utils/supabase";

test("inbox WhatsApp: abrir conversa, assumir e devolver para IA", async ({ page }) => {
  // O inbox só existe com provedor configurado; semeamos config + instância +
  // uma conversa (via a sessão autenticada da própria admin — RLS permite).
  const ctx = await supabaseCtx(page);
  const { phone } = await seedWhatsAppInbox(page, ctx);

  await page.goto("/whatsapp");
  await expect(page.getByRole("heading", { name: "WhatsApp", level: 1 })).toBeVisible();

  // Abre a conversa semeada (sem contato vinculado, o nome exibido é o telefone).
  await page.getByRole("button", { name: new RegExp(phone) }).click();

  // Estado inicial: IA ativa.
  await expect(page.getByText("IA ativa").first()).toBeVisible();

  // Assumir atendimento (IA → humano).
  await page.getByRole("button", { name: "Assumir" }).click();
  await expect(page.getByText("Você assumiu a conversa.")).toBeVisible();
  await expect(page.getByText("Em atendimento humano").first()).toBeVisible();

  // Devolver para IA (humano → IA).
  await page.getByRole("button", { name: "Devolver para IA" }).click();
  await expect(page.getByText("Conversa devolvida para a IA.")).toBeVisible();
  await expect(page.getByText("IA ativa").first()).toBeVisible();
});
