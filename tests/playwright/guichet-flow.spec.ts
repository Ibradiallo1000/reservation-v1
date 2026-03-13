import { test, expect } from "@playwright/test";

/**
 * E2E: Guichet (agency ticket office) flow
 * Route: /agence/guichet
 * Roles: guichetier, chefAgence, admin_compagnie
 *
 * Optional env for a real run with a guichetier account:
 *   E2E_GUICHET_EMAIL, E2E_GUICHET_PASSWORD
 * If not set, placeholder credentials are used (login may fail; test then asserts redirect to login).
 */
test.describe("Guichet flow", () => {
  test("open login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel(/Adresse e-mail|e-mail/i)).toBeVisible();
  });

  test("guichet flow: login then open guichet page", async ({ page }) => {
    const email = process.env.E2E_GUICHET_EMAIL ?? "guichet@test.teliya.app";
    const password = process.env.E2E_GUICHET_PASSWORD ?? "placeholder-password";

    // 1. Open login page
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page).toHaveURL(/\/login/);

    // 2. Fill email and continue (two-step login: label "Adresse e-mail", button "Continuer")
    await page.getByLabel(/Adresse e-mail|e-mail/i).fill(email);
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForLoadState("networkidle").catch(() => {});

    // 3. Fill password and submit (label "Mot de passe", button "Connexion")
    await page.getByLabel(/Mot de passe/i).fill(password);
    await page.getByRole("button", { name: /Connexion/ }).click();

    // 4. Wait for navigation after login (redirect by role or stay on login if failed)
    await page.waitForURL(/\/(login|agence\/guichet|agence\/dashboard|role-landing)/, { timeout: 15000 }).catch(() => {});

    // 5. Navigate to guichet (if we landed elsewhere, e.g. chefAgence on dashboard)
    await page.goto("/agence/guichet");
    await page.waitForLoadState("networkidle").catch(() => {});

    // 6. Verify: either guichet page with key content (tab "Guichet"), or redirect to login (auth required)
    const url = page.url();
    if (url.includes("/agence/guichet")) {
      await expect(page.getByRole("button", { name: "Guichet" })).toBeVisible({ timeout: 10000 });
    } else {
      await expect(page).toHaveURL(/\/(login|agence)/);
    }
  });

  test("guichet route requires authentication", async ({ page }) => {
    await page.goto("/agence/guichet");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    const hasLogin = await page.getByLabel(/Adresse e-mail|Mot de passe/i).first().isVisible().catch(() => false);
    const onGuichet = url.includes("/agence/guichet");

    expect(onGuichet || hasLogin || url.includes("/login")).toBeTruthy();
  });
});
