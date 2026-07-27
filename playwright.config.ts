import { defineConfig, devices } from "@playwright/test";

// Porta dedicada aos testes e2e (o dev normal roda em 8080). O Playwright sobe o
// próprio dev server nesta porta via `webServer` abaixo.
const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Smoke suite roda contra o backend real: serial e sem paralelismo para não
  // sobrecarregar nem criar corridas de dados.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // 1 retry também localmente. O primeiro run depois de um tempo parado sobe o
  // dev server frio: o Vite ainda transforma as rotas sob demanda e o timeout de
  // 10s do expect estoura nos primeiros specs que criam registro. Medido: 53s no
  // run frio contra 27s nos seguintes. Sem retry, isso vira falso alarme de
  // regressão — foi o que quase aconteceu no fechamento do Sprint 8.
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Faz login uma vez e persiste a sessão em e2e/.auth/user.json.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
