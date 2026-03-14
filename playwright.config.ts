import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for TELIYA.
 * webServer démarre automatiquement l'app Vite avant les tests et attend que l'URL soit disponible.
 * En local, reuseExistingServer: true évite de relancer le serveur s'il tourne déjà.
 */
export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 60000, // 60s per test (app uses Firebase/Firestore, slow first load)
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    // Port par défaut aligné sur le port Vite actuel (5192).
    // Peut être surchargé avec PLAYWRIGHT_BASE_URL si besoin.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5190",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    // Doit correspondre à baseURL pour éviter ERR_CONNECTION_REFUSED.
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5190",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
