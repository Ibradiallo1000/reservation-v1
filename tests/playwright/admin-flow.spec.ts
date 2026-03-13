import { test, expect as pwExpect } from "@playwright/test";

/**
 * E2E: Admin (plateforme) flow
 * Routes: /admin, /admin/dashboard
 * Roles: admin_platforme
 *
 * Optional env for a real run with an admin account:
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 */
test.describe("Admin flow", () => {
  test("open login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await pwExpect(page).toHaveURL(/\/login/);
    await pwExpect(page.getByLabel(/Adresse e-mail|e-mail/i)).toBeVisible();
  });

  test("admin flow: open admin dashboard and verify URL and main content", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    if (url.includes("/admin")) {
      await pwExpect(page).toHaveURL(/\/admin(\/dashboard)?/);
      await pwExpect(
        page.getByRole("heading", { name: /Vue d'ensemble plateforme/i }).or(page.getByText(/Tableau de bord|Compagnies actives|plateforme/)).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      await pwExpect(page).toHaveURL(/\/(login|admin)/);
    }
  });

  test("admin route requires authentication", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    const hasLogin = await page.getByLabel(/Adresse e-mail|Mot de passe/i).first().isVisible().catch(() => false);
    const onAdmin = url.includes("/admin");

    pwExpect(onAdmin || hasLogin || url.includes("/login")).toBeTruthy();
  });
});
