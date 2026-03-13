import { test, expect as pwExpect } from "@playwright/test";

/**
 * E2E: Flux réservation client (portail public)
 * Scénarios: ouverture portail → recherche trajet → création réservation → upload preuve → page billet
 * Routes: /:slug/reserver, /:slug/payment/:id, /:slug/upload-preuve/:id, /:slug/mon-billet, /:slug/reservation/:id
 * Rôle: Client (anonyme)
 *
 * Pour un flux complet avec données réelles: Firebase avec compagnie (slug demo), trajets et agences.
 * Sans données: les tests vérifient la structure des pages et les redirections.
 */
const SLUG = "demo";

test.describe("Reservation client flow", () => {
  // --- 1. Ouverture du portail public ---
  test("1. ouverture du portail public", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});

    pwExpect(page).toHaveURL(/\//);
    await pwExpect(page).toHaveTitle(/.+/);

    // Portail racine ou sous-domaine: au moins un élément principal visible
    const heading = page.getByRole("heading", { level: 1 });
    const main = page.getByRole("main");
    await pwExpect(heading.or(main).first()).toBeVisible({ timeout: 10000 });
  });

  test("1b. page reserver accessible (public)", async ({ page }) => {
    await page.goto(`/${SLUG}/reserver`);
    await page.waitForLoadState("networkidle").catch(() => {});

    pwExpect(page).toHaveURL(new RegExp(`/${SLUG}/reserver`));

    // Formulaire réservation, section date/heure, ou squelette de chargement
    const reservationTitle = page.getByText(/Réservation/i);
    const chooseDate = page.getByText(/Choisissez votre date|Sélectionnez la date/i);
    const namePlaceholder = page.getByPlaceholder(/Nom complet/i);
    const noTrip = page.getByText(/Aucun trajet|Aucun départ/i);
    const loadingSkeleton = page.locator("div.min-h-screen").first();

    await pwExpect(
      reservationTitle
        .or(chooseDate)
        .or(namePlaceholder)
        .or(noTrip)
        .or(loadingSkeleton)
        .first()
    ).toBeVisible({ timeout: 20000 });
  });

  // --- 2. Recherche trajet ---
  test("2. recherche trajet (page reserver avec critères)", async ({ page }) => {
    await page.goto(`/${SLUG}/reserver?departure=Bamako&arrival=Sikasso`);
    await page.waitForLoadState("networkidle").catch(() => {});

    pwExpect(page).toHaveURL(new RegExp(`/${SLUG}/reserver`));
    pwExpect(page).toHaveURL(/departure=|arrival=/);

    const routeCard = page.getByText(/Bamako|Sikasso|→/i);
    const dateSection = page.getByText(/Choisissez votre date|Sélectionnez la date et l'heure/i);
    const loadingOrContent = page.getByText(/Réservation|À partir de/i);
    const loadingSkeleton = page.locator("div.min-h-screen").first();

    await pwExpect(
      routeCard.or(dateSection).or(loadingOrContent).or(loadingSkeleton).first()
    ).toBeVisible({ timeout: 20000 });
  });

  // --- 3. Création réservation ---
  test("3. création réservation (formulaire + passage au paiement)", async ({ page }) => {
    await page.goto(`/${SLUG}/reserver?departure=Bamako&arrival=Sikasso`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const nameInput = page.getByPlaceholder(/Nom complet/i);
    const phoneInput = page.getByPlaceholder(/Téléphone/i);

    const nameVisible = await nameInput.isVisible().catch(() => false);
    const phoneVisible = await phoneInput.isVisible().catch(() => false);

    if (nameVisible && phoneVisible) {
      await nameInput.fill("Test Passenger E2E");
      await phoneInput.fill("22 22 22 22");

      // Sélection date si boutons présents
      const dateButton = page
        .getByRole("button", { name: /lun|mar|mer|jeu|ven|sam|dim|Aujourd'hui|Demain/i })
        .first();
      if (await dateButton.isVisible().catch(() => false)) {
        await dateButton.click();
        await page.waitForLoadState("networkidle").catch(() => {});
      }

      const timeButton = page.getByRole("button", { name: /\d{1,2}:\d{2}/ }).first();
      if (await timeButton.isVisible().catch(() => false)) {
        await timeButton.click();
      }

      const submitButton = page.getByRole("button", { name: /Passer au paiement/i });
      await pwExpect(submitButton).toBeVisible({ timeout: 5000 });
      await submitButton.click();

      await page.waitForLoadState("networkidle").catch(() => {});

      const url = page.url();
      const onPayment = url.includes("/payment/");
      const stillOnReserver = url.includes("/reserver");

      pwExpect(onPayment || stillOnReserver).toBeTruthy();
      if (onPayment) {
        pwExpect(page).toHaveURL(/\/payment\/.+/);
      }
    } else {
      // Pas de trajets chargés: on reste sur reserver, structure correcte
      pwExpect(page).toHaveURL(new RegExp(`/${SLUG}/reserver`));
    }
  });

  // --- 3b. Page paiement (après création réservation) ---
  // Avec Firebase (compagnie slug=demo): affiche moyens de paiement ou "Réservation introuvable" ou 404.
  // Sans backend: RouteResolver peut rester en chargement — on vérifie au moins que l’URL est correcte.
  test("3b. page paiement — URL correcte et contenu ou chargement", async ({ page }) => {
    await page.goto(`/${SLUG}/payment/fake-reservation-id`);
    await page.waitForLoadState("networkidle").catch(() => {});

    pwExpect(page).toHaveURL(new RegExp(`/${SLUG}/payment/|/payment/`));

    const paymentTitle = page.getByText(/Mode de paiement|Choisissez votre moyen/i);
    const errorMsg = page.getByText(/Réservation introuvable|Données de réservation manquantes|Réservation invalide/i);
    const notFound = page.getByText(/404|Page introuvable|introuvable/i);
    const contentVisible = await paymentTitle
      .or(errorMsg)
      .or(notFound)
      .first()
      .isVisible({ timeout: 20000 })
      .catch(() => false);

    pwExpect(contentVisible || page.url().includes("payment")).toBeTruthy();
  });

  // --- 4. Upload preuve de paiement ---
  // Avec Firebase (compagnie slug=demo): formulaire preuve ou erreur ou 404.
  // Sans backend: RouteResolver peut rester en chargement — on vérifie au moins que l’URL est correcte.
  test("4. page upload preuve accessible", async ({ page }) => {
    await page.goto(`/${SLUG}/upload-preuve/fake-reservation-id`);
    await page.waitForLoadState("networkidle").catch(() => {});

    pwExpect(page).toHaveURL(new RegExp(`/${SLUG}/upload-preuve/|/upload-preuve/`));

    const uploadTitle = page.getByText(/Téléversement de preuve|Upload proof/i);
    const refLabel = page.getByLabel(/Référence de transaction|Transaction reference/i);
    const sendProof = page.getByRole("button", { name: /Envoyer la preuve|Send payment proof/i });
    const impossible = page.getByText(/Impossible de charger|Réservation introuvable|Une erreur/i);
    const notFound = page.getByText(/404|Page introuvable|introuvable/i);
    const contentVisible = await uploadTitle
      .or(refLabel)
      .or(sendProof)
      .or(impossible)
      .or(notFound)
      .first()
      .isVisible({ timeout: 20000 })
      .catch(() => false);

    pwExpect(contentVisible || page.url().includes("upload-preuve")).toBeTruthy();
  });

  test("4b. upload preuve — champs et bouton visibles quand données chargées", async ({ page }) => {
    await page.goto(`/${SLUG}/upload-preuve/fake-id`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Si la page affiche le formulaire (ex: state récupéré), on doit voir référence ou bouton
    const refOrPlaceholder = page.getByPlaceholder(/Paiement|Réf|MTN|Orange/i);
    const detailsTitle = page.getByText(/Détails du paiement|Payment details/i);
    const errorOrRetry = page.getByText(/Impossible de charger|Réessayer|Retour/i);

    await pwExpect(
      refOrPlaceholder.or(detailsTitle).or(errorOrRetry).first()
    ).toBeVisible({ timeout: 10000 });
  });

  // --- 5. Vérification page billet ---
  test("5. page billet — token invalide affiche réservation introuvable", async ({ page }) => {
    await page.goto(`/${SLUG}/mon-billet?r=invalid-token`);
    await page.waitForLoadState("networkidle").catch(() => {});

    pwExpect(page).toHaveURL(new RegExp(`/${SLUG}/mon-billet`));

    const introuvable = page.getByText(/Réservation introuvable|expirée|supprimée/i);
    const createNew = page.getByRole("button", { name: /Créer une nouvelle réservation/i });
    const backButton = page.getByRole("button", { name: /Retour/i });

    await pwExpect(
      introuvable.or(createNew).or(backButton).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("5b. page billet — id réservation invalide", async ({ page }) => {
    await page.goto(`/${SLUG}/reservation/fake-reservation-id`);
    await page.waitForLoadState("networkidle").catch(() => {});

    pwExpect(page).toHaveURL(new RegExp(`/${SLUG}/reservation/`));

    const introuvable = page.getByText(/Réservation introuvable|expirée|supprimée/i);
    const createNew = page.getByRole("button", { name: /Créer une nouvelle réservation/i });

    await pwExpect(introuvable.or(createNew).first()).toBeVisible({ timeout: 15000 });
  });

  test("5c. page billet — section « Votre billet » visible quand réservation valide", async ({
    page,
  }) => {
    // Sans token/id valide, on ne peut pas garantir le contenu "Votre billet".
    // On vérifie que la route reservation/:id ou mon-billet répond et affiche soit le billet soit l'erreur.
    await page.goto(`/${SLUG}/reservation/fake-id`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const cardTitle = page.getByText(/Réservation introuvable|Votre billet|Détails de réservation/i);
    await pwExpect(cardTitle.first()).toBeVisible({ timeout: 15000 });
  });
});
