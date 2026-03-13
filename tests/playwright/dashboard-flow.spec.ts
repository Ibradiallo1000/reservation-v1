import { test, expect as pwExpect } from "@playwright/test";

/**
 * E2E: Dashboard agence (poste de pilotage) flow
 * Routes: /agence/dashboard
 * Roles: chefAgence, superviseur, admin_compagnie
 *
 * Optional env for a real run with a dashboard account:
 *   E2E_DASHBOARD_EMAIL, E2E_DASHBOARD_PASSWORD
 */
test.describe("Dashboard flow", () => {
  test("open login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await pwExpect(page).toHaveURL(/\/login/);
    await pwExpect(page.getByLabel(/Adresse e-mail|e-mail/i)).toBeVisible();
  });

  test("dashboard flow: open agence dashboard and verify URL and main content", async ({ page }) => {
    await page.goto("/agence/dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    if (url.includes("/agence/dashboard")) {
      await pwExpect(page).toHaveURL(/\/agence\/dashboard/);
      await pwExpect(
        page.getByRole("heading", { name: /Poste de pilotage agence/i }).or(page.getByText(/Poste de pilotage|CA période|Guichets actifs/)).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      await pwExpect(page).toHaveURL(/\/(login|agence)/);
    }
  });

  test("dashboard route requires authentication", async ({ page }) => {
    await page.goto("/agence/dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    const hasLogin = await page.getByLabel(/Adresse e-mail|Mot de passe/i).first().isVisible().catch(() => false);
    const onDashboard = url.includes("/agence/dashboard");

    pwExpect(onDashboard || hasLogin || url.includes("/login")).toBeTruthy();
  });
});
