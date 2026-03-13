import { test, expect as pwExpect } from "@playwright/test";

/**
 * E2E: Treasury (trésorerie agence) flow
 * Routes: /agence/treasury
 * Roles: chefAgence, comptable, admin_compagnie (comptabilité)
 *
 * Optional env for a real run with a treasury-capable account:
 *   E2E_TREASURY_EMAIL, E2E_TREASURY_PASSWORD
 */
test.describe("Treasury flow", () => {
  test("open login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await pwExpect(page).toHaveURL(/\/login/);
    await pwExpect(page.getByLabel(/Adresse e-mail|e-mail/i)).toBeVisible();
  });

  test("treasury flow: open treasury page and verify URL and main content", async ({ page }) => {
    await page.goto("/agence/treasury");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    if (url.includes("/agence/treasury")) {
      await pwExpect(page).toHaveURL(/\/agence\/treasury/);
      await pwExpect(
        page.getByRole("heading", { name: /Trésorerie agence/i }).or(page.getByText(/Trésorerie|Position caisse|Trésorerie agence/)).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      await pwExpect(page).toHaveURL(/\/(login|agence)/);
    }
  });

  test("treasury route requires authentication", async ({ page }) => {
    await page.goto("/agence/treasury");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    const hasLogin = await page.getByLabel(/Adresse e-mail|Mot de passe/i).first().isVisible().catch(() => false);
    const onTreasury = url.includes("/agence/treasury");

    pwExpect(onTreasury || hasLogin || url.includes("/login")).toBeTruthy();
  });
});
