import { test as setup, expect } from "@playwright/test";

// Sessão persistida após o login; reutilizada pelos demais specs (evita relogar).
// Caminho relativo à raiz do projeto (mesmo do storageState em playwright.config).
const authFile = "e2e/.auth/user.json";

// Credenciais vêm SÓ do ambiente — nunca hardcodadas/versionadas.
// O email tem um default (é público), a senha é obrigatória via E2E_PASSWORD.
const EMAIL = process.env.E2E_EMAIL ?? "sabrina@viverdeia.ai";
const PASSWORD = process.env.E2E_PASSWORD;

setup("login e persiste a sessão", async ({ page }) => {
  if (!PASSWORD) {
    throw new Error(
      "Defina E2E_PASSWORD no ambiente para rodar os testes e2e (a senha não é versionada).",
    );
  }

  await page.goto("/auth");

  // O formulário de cadastro coexiste no DOM (oculto); escopamos ao de login.
  const loginBox = page.locator(".auth-form-box.login");
  await loginBox.locator("#login-email").fill(EMAIL);
  await loginBox.locator("#login-password").fill(PASSWORD);
  await loginBox.locator('button[type="submit"]').click();

  // Login OK → redireciona ao dashboard.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
