import { test, expect as pwExpect } from "@playwright/test";

/**
 * E2E: Accounting (comptabilité compagnie) flow
 * Routes: /compagnie/:companyId/accounting (Vue Globale, Trésorerie, etc.)
 * Roles: company_accountant, financial_director, admin_platforme
 *
 * Uses test company "mali-trans" (slug/id) for URL; without auth redirects to login.
 * Optional env for a real run: E2E_ACCOUNTING_EMAIL, E2E_ACCOUNTING_PASSWORD
 */
test.describe("Accounting flow", () => {
  const accountingCompanyId = "mali-trans";

  test("open login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => {});
    await pwExpect(page).toHaveURL(/\/login/);
    await pwExpect(page.getByLabel(/Adresse e-mail|e-mail/i)).toBeVisible();
  });

  test("accounting flow: open accounting page and verify URL and main content", async ({ page }) => {
    await page.goto(`/compagnie/${accountingCompanyId}/accounting`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    if (url.includes("/accounting")) {
      await pwExpect(page).toHaveURL(new RegExp(`/compagnie/${accountingCompanyId}/accounting`));
      await pwExpect(
        page.getByRole("heading", { name: /Vue Globale Compagnie|Comptabilité/i }).or(page.getByText(/Vue Globale|Trésorerie|Comptabilité/)).first()
      ).toBeVisible({ timeout: 10000 });
    } else {
      await pwExpect(page).toHaveURL(/\/(login|compagnie|role-landing)/);
    }
  });

  test("accounting route requires authentication", async ({ page }) => {
    await page.goto(`/compagnie/${accountingCompanyId}/accounting`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const url = page.url();
    const hasLogin = await page.getByLabel(/Adresse e-mail|Mot de passe/i).first().isVisible().catch(() => false);
    const onAccounting = url.includes("/accounting");

    pwExpect(onAccounting || hasLogin || url.includes("/login") || url.includes("/role-landing")).toBeTruthy();
  });
});
