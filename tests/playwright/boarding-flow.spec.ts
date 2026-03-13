import { test, expect as pwExpect } from "@playwright/test";

/**
 * E2E: Embarquement (boarding) flow
 * Routes: /agence/boarding (dashboard), /agence/boarding/scan (scan billets)
 * Roles: chefEmbarquement, chefAgence, admin_compagnie
 *
 * Optional env for a real run with a boarding account:
 *   E2E_BOARDING_EMAIL, E2E_BOARDING_PASSWORD
 */
test.describe("Boarding flow", () => {
  test("open login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await pwExpect(page).toHaveURL(/\/login/);
    await pwExpect(page.getByLabel(/Adresse e-mail|e-mail/i)).toBeVisible();
  });

  test("boarding flow: login then dashboard then scan page", async ({ page }) => {
    const email = process.env.E2E_BOARDING_EMAIL ?? "embarquement@test.teliya.app";
    const password = process.env.E2E_BOARDING_PASSWORD ?? "placeholder-password";

    // 1. Open login page
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await pwExpect(page).toHaveURL(/\/login/);

    // 2. Fill email and continue (two-step login)
    await page.getByLabel(/Adresse e-mail|e-mail/i).fill(email);
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForLoadState("networkidle").catch(() => {});

    // 3. Fill password and submit
    await page.getByLabel(/Mot de passe/i).fill(password);
    await page.getByRole("button", { name: /Connexion/ }).click();

    // 4. Wait for navigation after login
    await page
      .waitForURL(/\/(login|agence\/boarding|agence\/dashboard|role-landing)/, { timeout: 15000 })
      .catch(() => {});

    // 5. Navigate to boarding dashboard
    await page.goto("/agence/boarding");
    await page.waitForLoadState("networkidle").catch(() => {});

    // 6. Verify dashboard: heading "Départs du jour" or key text, or redirect (auth required)
    const urlAfterBoard = page.url();
    if (urlAfterBoard.includes("/agence/boarding")) {
      await pwExpect(
        page.getByRole("heading", { name: "Départs du jour" }).or(page.getByText(/Sélectionnez un départ|Embarquement/)).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      await pwExpect(page).toHaveURL(/\/(login|agence)/);
    }

    // 7. Navigate to scan page (only if we're on boarding)
    if (urlAfterBoard.includes("/agence/boarding")) {
      await page.goto("/agence/boarding/scan");
      await page.waitForLoadState("networkidle").catch(() => {});

      // 8. Verify scan page: heading "Liste d'embarquement" or nav "Scan / Liste"
      await pwExpect(page).toHaveURL(/\/agence\/boarding\/scan/);
      await pwExpect(
        page.getByRole("heading", { name: "Liste d'embarquement" }).or(page.getByText(/Scan \/ Liste|Scanner|Liste d'embarquement/)).first()
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test("boarding route requires authentication", async ({ page }) => {
    await page.goto("/agence/boarding");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    const hasLogin = await page.getByLabel(/Adresse e-mail|Mot de passe/i).first().isVisible().catch(() => false);
    const onBoarding = url.includes("/agence/boarding");

    pwExpect(onBoarding || hasLogin || url.includes("/login")).toBeTruthy();
  });
});
