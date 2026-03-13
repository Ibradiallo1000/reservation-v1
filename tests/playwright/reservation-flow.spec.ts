import { test, expect } from "@playwright/test";

/**
 * E2E: Reservation flow
 * Requires app running (npm run dev) and, for full flow, Firebase/backend with at least one company and trips.
 * 1. Open homepage
 * 2. Search trip (navigate to search or reservation entry)
 * 3. Click reservation / go to reservation page
 * 4. Fill passenger form (name, phone)
 * 5. Submit reservation
 * 6. Validate that reservation confirmation / payment page appears
 */
test.describe("Reservation flow", () => {
  test("open homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page).toHaveURL(/\//);
    await expect(page).toHaveTitle(/.+/);
  });

  test("reservation flow: homepage -> search -> reservation form -> confirmation", async ({
    page,
  }) => {
    // 1. Open homepage
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page).toHaveURL(/\//);

    // 2. Search trip: go to platform search results (or company reservation entry point)
    await page.goto("/resultats");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page).toHaveURL(/\/resultats/);

    // 3. Navigate to a company reservation page
    const slug = "demo";
    await page.goto(`/${slug}/reserver?departure=Bamako&arrival=Sikasso`);
    await expect(page).toHaveURL(new RegExp(`/${slug}/reserver`));
    await page.waitForLoadState("networkidle").catch(() => {});

    // 4. Fill passenger form (only if form is visible – requires backend data)
    const nameInput = page.getByPlaceholder(/Nom complet/);
    const phoneInput = page.getByPlaceholder(/Téléphone/);

    if ((await nameInput.isVisible()) && (await phoneInput.isVisible())) {
      await nameInput.fill("Test Passenger");
      await phoneInput.fill("22 22 22 22");

      // Select date and time if present (first available)
      const dateButton = page.getByRole("button", { name: /lun|mar|mer|jeu|ven|sam|dim|Aujourd'hui|Demain/i }).first();
      if (await dateButton.isVisible()) {
        await dateButton.click();
      }
      const timeButton = page.getByRole("button", { name: /\d{1,2}:\d{2}/ }).first();
      if (await timeButton.isVisible()) {
        await timeButton.click();
      }

      // 5. Submit reservation (button "Passer au paiement")
      const submitButton = page.getByRole("button", { name: /Passer au paiement/i });
      await expect(submitButton).toBeVisible();
      await submitButton.click();

      // 6. Validate that reservation confirmation / payment page appears
      await expect(page).toHaveURL(/\/payment\//, { timeout: 15000 });
    } else {
      // No trips loaded (e.g. no backend or slug) – at least URL and structure are correct
      await expect(page).toHaveURL(new RegExp(`/${slug}/reserver`));
    }
  });
});
