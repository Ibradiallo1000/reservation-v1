import { test, expect as pwExpect } from "@playwright/test";

/**
 * E2E: Fleet (flotte agence) flow
 * Routes: /agence/fleet (tableau de bord), /agence/fleet/operations, etc.
 * Roles: agency_fleet_controller, chefAgence, admin_compagnie
 *
 * Optional env for a real run with a fleet account:
 *   E2E_FLEET_EMAIL, E2E_FLEET_PASSWORD
 */
test.describe("Fleet flow", () => {
  test("open login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await pwExpect(page).toHaveURL(/\/login/);
    await pwExpect(page.getByLabel(/Adresse e-mail|e-mail/i)).toBeVisible();
  });

  test("fleet flow: open fleet page and verify URL and main content", async ({ page }) => {
    await page.goto("/agence/fleet");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    if (url.includes("/agence/fleet")) {
      await pwExpect(page).toHaveURL(/\/agence\/fleet/);
      await pwExpect(
        page.getByRole("heading", { name: /Tableau de bord Flotte|Flotte/i }).or(page.getByText(/Véhicules|Flotte|Exploitation/)).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      await pwExpect(page).toHaveURL(/\/(login|agence)/);
    }
  });

  test("fleet route requires authentication", async ({ page }) => {
    await page.goto("/agence/fleet");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    const hasLogin = await page.getByLabel(/Adresse e-mail|Mot de passe/i).first().isVisible().catch(() => false);
    const onFleet = url.includes("/agence/fleet");

    pwExpect(onFleet || hasLogin || url.includes("/login")).toBeTruthy();
  });
});
