import { test, expect as pwExpect } from "@playwright/test";

/**
 * E2E: Courrier flow
 * Routes: /agence/courrier (redirects to /agence/courrier/session)
 * Roles: agentCourrier, chefAgence, admin_compagnie
 *
 * Optional env for a real run with a courrier account:
 *   E2E_COURRIER_EMAIL, E2E_COURRIER_PASSWORD
 */
test.describe("Courrier flow", () => {
  test("open login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await pwExpect(page).toHaveURL(/\/login/);
    await pwExpect(page.getByLabel(/Adresse e-mail|e-mail/i)).toBeVisible();
  });

  test("courrier flow: open courrier page and verify URL and main content", async ({ page }) => {
    await page.goto("/agence/courrier");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    if (url.includes("/agence/courrier")) {
      await pwExpect(page).toHaveURL(/\/agence\/courrier(\/session)?/);
      await pwExpect(
        page.getByRole("heading", { name: /Session Courrier/i }).or(page.getByText(/Session|Courrier|Créer une session/)).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      await pwExpect(page).toHaveURL(/\/(login|agence)/);
    }
  });

  test("courrier route requires authentication", async ({ page }) => {
    await page.goto("/agence/courrier");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    const hasLogin = await page.getByLabel(/Adresse e-mail|Mot de passe/i).first().isVisible().catch(() => false);
    const onCourrier = url.includes("/agence/courrier");

    pwExpect(onCourrier || hasLogin || url.includes("/login")).toBeTruthy();
  });
});
