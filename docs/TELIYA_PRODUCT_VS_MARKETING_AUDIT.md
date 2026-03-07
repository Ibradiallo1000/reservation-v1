# TELIYA — Product vs Marketing Audit

**Goal:** Verify that the marketing homepage accurately represents what the TELIYA platform actually does.

**Scope:** Entire TELIYA system (internal + external); all marketing homepage sections.

---

## Part 1 — Real Product Capabilities

### INTERNAL PLATFORM FEATURES

Identified from routes (`AppRoutes.tsx`), roles (`routePermissions.ts`, `roles.ts`), and module structure:

| Capability | Implementation | Routes / Notes |
|------------|----------------|----------------|
| **Direction / company dashboard** | ✅ | `/compagnie/:companyId/dashboard` (CompagnieDashboard), command-center, payment-approvals |
| **Agency management** | ✅ | `/compagnie/:companyId/agences` (CompagnieAgencesPage) — list, add, configure agencies |
| **Guichet (ticket sales)** | ✅ | `/agence/guichet` (AgenceGuichetPage), `/agence/receipt/:id`, reservations/print — guichetier, chefAgence |
| **Boarding control** | ✅ | `/agence/boarding` (BoardingLayout), dashboard + scan (BoardingScanPage) — chefEmbarquement, chefAgence |
| **Courier / parcel management** | ✅ | `/agence/courrier` — session, nouveau, lots, reception, remise, rapport — agentCourrier, chefAgence |
| **Fleet management** | ✅ | **Company:** `/compagnie/:companyId/garage` (GarageLayout) — dashboard, fleet, maintenance, transit, incidents (chef_garage). **Agency:** `/agence/fleet` — dashboard, operations, assignment, vehicles, movements (agency_fleet_controller, chefAgence) |
| **Accounting and financial tracking** | ✅ | **Company:** `/compagnie/:companyId/comptabilite`, revenus-liquidites, payment-approvals, treasury. **Accountant layout:** `/compagnie/:companyId/accounting` — VueGlobale, reservations-en-ligne, finances, treasury, rapports, paramètres. **Agency:** `/agence/comptabilite` (AgenceComptabilitePage) |
| **Statistics and reports** | ✅ | Admin: statistiques; Compagnie: dashboard KPIs; Agence: reports (ManagerReportsPage); Accounting: rapports; Courrier: rapport |
| **User roles and permissions** | ✅ | admin_platforme, admin_compagnie, chef_garage, company_accountant, financial_director, chefAgence, superviseur, guichetier, chefEmbarquement, agency_fleet_controller, agency_accountant, agentCourrier — enforced per route |
| **Multi-agency synchronization** | ✅ | Compagnie sees all agences; agences under one company share data; Firestore structure companies/{id}/agences, etc. |
| **Online reservations (internal view)** | ✅ | Compagnie reservations list; Accounting: reservations-en-ligne; company can enable/disable online booking per plan |
| **Payment approvals (CEO)** | ✅ | CEOPaymentApprovalsPage — validation of payments |
| **Trip costs** | ✅ | `/compagnie/:companyId/trip-costs` (TripCostsPage) |
| **Validations (comptable / chef agence)** | ✅ | ValidationComptablePage, ValidationChefAgencePage |
| **Image library** | ✅ | BibliothequeImagesPage, MediaPage (admin) |
| **Payment settings (company)** | ✅ | CompanyPaymentSettingsPage |
| **Avis clients (moderation)** | ✅ | AvisModerationPage |

### EXTERNAL FEATURES

| Capability | Implementation | Routes / Notes |
|------------|----------------|----------------|
| **Online reservations (customer)** | ✅ | RouteResolver → `booking` → ReservationClientPage (/:slug/reserver or subdomain) |
| **Customer booking flow** | ✅ | Search → select trip → passenger info → payment method selection → optional upload proof |
| **Payment proof upload** | ✅ | UploadPreuvePage (/:slug/upload-preuve/:id); submitProof; recovery from localStorage |
| **Reservation confirmation / receipt** | ✅ | ReceiptEnLignePage (receipt, confirmation); ReservationDetailsPage (reservation, mon-billet, details) |
| **Public company pages** | ✅ | PublicCompanyPage when subPath null (company home); CompanyAboutPage (a-propos); AidePage (aide) |
| **Find reservation** | ✅ | FindReservationPage (retrouver-reservation) |
| **My reservations / My tickets** | ✅ | ClientMesReservationsPage, ClientMesBilletsPage (mes-reservations, mes-billets) |
| **Legal pages (per company)** | ✅ | Mentions, Confidentialite, Conditions, Cookies (/:slug/...) |
| **Search results (agency-level)** | ✅ | ResultatsAgencePage (resultats) |

### FEATURES NOT PRESENT OR LIMITED

- **Fully automated online payment (e.g. card gateway):** Payment flow is method selection + optional proof upload; validation can be manual (payment approvals).
- **Real-time sync** is implied; actual sync is via Firestore (real-time where listeners are used).

---

## Part 2 — What the Homepage Communicates

### HeroSection

- **Title:** “Pilotez votre réseau de transport depuis une seule plateforme”
- **Subtitle:** “TELIYA centralise vos agences, ventes, réservations, embarquement et comptabilité en temps réel.”
- **Trust line:** Gestion multi-agences, Réservations en ligne, Billets numériques, Statistiques en temps réel
- **CTAs:** Demander une démo, Voir comment ça fonctionne

### ProblemSection

- **Title:** “Les défis des compagnies de transport”
- **Subtitle:** Gérer plusieurs agences, ventes et embarquements sans outil adapté complique le quotidien.
- **Cards:** Données dispersées; Suivi manuel; Manque de visibilité

### SolutionSection

- **Title:** “Une solution pensée pour le transport”
- **Cards:** Tout centralisé (réservations, agences, embarquement); Temps réel (ventes, départs, tableau de bord); Déploiement simple (mise en place rapide, formation légère)

### HowItWorksSection

- **Title:** “Comment TELIYA fonctionne”
- **Steps:** Configuration (agences, trajets, tarifs); Formation (vente, embarquement); Mise en route (vente et suivi depuis tableau de bord)

### ProductShowcaseSection

- **Title:** “Une plateforme complète pour votre compagnie”
- **Subtitle:** TELIYA centralise toutes vos opérations : agences, ventes, réservations, embarquement et comptabilité.
- **Tabs (5):** Direction, Agences, Ventes (guichet), Opérations (embarquement), Finance (comptabilité)
- **Content per tab:** Benefit-oriented title + description + feature list + image (from Firestore or defaults). **Not shown in tabs:** Réservation en ligne (module), Courrier (module), Flotte (module) — only Direction, Agences, Guichet, Embarquement, Comptabilité are in the tab bar.

### TrustSection

- **Title:** “Pourquoi les compagnies choisissent TELIYA”
- **Cards:** Plateforme transport; Multi-agences centralisée; Suivi temps réel; Mise en place rapide

### PlatformStatsSection

- **Title:** “TELIYA en chiffres”
- **Metrics:** Companies count, Agencies count, Reservations count (from Firestore)
- **Fallback:** “Rejoignez les premières compagnies qui modernisent leur réseau avec TELIYA.”

### FinalCTASection

- **Title:** “Prêt à simplifier la gestion de votre transport ?”
- **Subtitle:** Demander une démo, découvrir comment TELIYA peut accompagner votre compagnie.

### RequestDemoSection

- Lead form → `platformLeads` (name, email, company, message).

---

## Part 3 — Section-by-Section Analysis

### HeroSection

| Aspect | Assessment |
|--------|------------|
| **Real capabilities represented** | Central platform, multi-agency, sales, reservations, boarding, accounting — all exist. “Réseau de transport” and “une seule plateforme” match. |
| **Accuracy** | ✅ Accurate. Subtitle aligns with product (agences, ventes, réservations, embarquement, comptabilité). Trust line (multi-agences, réservations en ligne, billets numériques, stats) is correct. |
| **Missing** | Courier and fleet are not mentioned in hero (they exist internally). Acceptable for a short hero. |
| **Overstated / misleading** | “En temps réel” is fair (Firestore + real-time listeners). No overstatement. |

### ProblemSection

| Aspect | Assessment |
|--------|------------|
| **Real capabilities represented** | Problems: scattered data, manual processes, lack of visibility — addressed by centralization, dashboards, and reports in the product. |
| **Accuracy** | ✅ Accurate. Generic pain points that TELIYA actually addresses. |
| **Missing** | Nothing critical. |
| **Overstated / misleading** | None. |

### SolutionSection

| Aspect | Assessment |
|--------|------------|
| **Real capabilities represented** | Centralization (agencies, reservations, boarding); real-time (dashboards, sales, departures); quick deployment (config, training, go-live). |
| **Accuracy** | ✅ Accurate. Matches multi-agency, single dashboard, and onboarding flow. |
| **Missing** | Courier and fleet not mentioned; acceptable at this level. |
| **Overstated / misleading** | None. |

### HowItWorksSection

| Aspect | Assessment |
|--------|------------|
| **Real capabilities represented** | Setup (agences, trajets, tarifs), training (vente, embarquement), go-live (tableau de bord). |
| **Accuracy** | ✅ Accurate. Reflects real onboarding and usage. |
| **Missing** | Could briefly hint at “réservation en ligne” for clients (optional). |
| **Overstated / misleading** | None. |

### ProductShowcaseSection

| Aspect | Assessment |
|--------|------------|
| **Real capabilities represented** | Direction (dashboard), Agences, Guichet (ventes), Embarquement, Comptabilité. Each tab maps to real modules. |
| **Accuracy** | ✅ Largely accurate. Descriptions and benefit titles match actual features. |
| **Missing** | **Important:** Three real modules are not in the tab bar: (1) **Réservation en ligne** (customer booking + internal view), (2) **Courrier** (parcel/shipment management), (3) **Flotte** (company + agency fleet). So “Une plateforme complète” is slightly overstated as long as these are absent from the showcase. |
| **Overstated / misleading** | “Complète” and “toutes vos opérations” suggest everything is covered; courrier and flotte are not shown. Réservation en ligne (customer-facing) is a major differentiator and is only in hero trust line, not in product tabs. |

### TrustSection

| Aspect | Assessment |
|--------|------------|
| **Real capabilities represented** | Transport-focused platform, multi-agency, real-time dashboards, quick setup. |
| **Accuracy** | ✅ Accurate. No false claims. |
| **Missing** | Could add one line on “réservation en ligne pour vos clients” if desired. |
| **Overstated / misleading** | None. |

### PlatformStatsSection

| Aspect | Assessment |
|--------|------------|
| **Real capabilities represented** | Live counts: companies, agencies, reservations (from Firestore). |
| **Accuracy** | ✅ Accurate. Numbers are real platform data. |
| **Missing** | N/A. |
| **Overstated / misleading** | None. |

### FinalCTASection

| Aspect | Assessment |
|--------|------------|
| **Real capabilities represented** | Generic CTA to simplify transport management and request a demo. |
| **Accuracy** | ✅ Accurate. |
| **Missing** | N/A. |
| **Overstated / misleading** | None. |

---

## Part 4 — Mapping Table: Platform Feature → Homepage Section

| Platform feature | Homepage section(s) representing it |
|------------------|-------------------------------------|
| Company dashboard / direction | HeroSection (title, subtitle), ProductShowcaseSection (Direction tab), TrustSection (real-time, multi-agency) |
| Agency management | HeroSection (agences), ProblemSection (multiple agences), SolutionSection (centralized), ProductShowcaseSection (Agences tab), TrustSection (multi-agency) |
| Guichet (ticket sales) | HeroSection (ventes), SolutionSection (centralized sales), ProductShowcaseSection (Ventes tab) |
| Boarding control | HeroSection (embarquement), ProblemSection (embarquements), SolutionSection, HowItWorksSection (embarquement), ProductShowcaseSection (Opérations tab) |
| Courier / parcel management | **Not represented** in any section (only in default Firestore productPresentation data, not in current 5-tab showcase) |
| Fleet management (company + agency) | **Not represented** in any section (same as above) |
| Accounting / financial tracking | HeroSection (comptabilité), ProductShowcaseSection (Finance tab) |
| Statistics and reports | HeroSection (statistiques en temps réel), TrustSection (suivi temps réel), PlatformStatsSection (chiffres) |
| User roles and permissions | Not explicitly mentioned (acceptable for marketing) |
| Multi-agency synchronization | HeroSection, ProblemSection, SolutionSection, ProductShowcaseSection (Agences), TrustSection |
| Online reservations (internal view) | Implied by “réservations” in hero/solution/showcase subtitle; no dedicated tab |
| **Online reservations (customer)** | **HeroSection** (trust: “Réservations en ligne”, “Billets numériques”). **Not** in ProductShowcaseSection tabs (Réservation en ligne module exists in data but is not one of the 5 tabs). |
| Customer booking flow | Not described in detail (acceptable) |
| Payment proof upload | Not mentioned (acceptable; implementation detail) |
| Reservation confirmation | Implied by “billets numériques” and “réservations” |
| Public company pages | Not explicitly mentioned (acceptable) |

---

## Part 5 — Important Capabilities Not Represented on the Homepage

1. **Réservation en ligne (customer-facing)**  
   - Present in hero trust line and in platform/subtitle, but **not** in the ProductShowcaseSection tab bar. The “Réservation en ligne” module exists in default/Firestore data but the current 5-tab UI shows only Direction, Agences, Ventes (guichet), Opérations (embarquement), Finance. So the **customer-facing online booking** is under-represented in the main product showcase.

2. **Courrier (parcel / shipment management)**  
   - Real feature (agence/courrier: session, create, batches, reception, pickup, reports). **Not** mentioned in hero, solution, or showcase tabs. Only present in default productPresentation, not in the 5 categories.

3. **Flotte (fleet management)**  
   - Real feature (company garage + agency fleet: vehicles, assignment, maintenance, transit, incidents). **Not** mentioned in hero or in showcase tabs. Same as above.

4. **Payment approvals / validation workflows**  
   - CEO payment approvals and comptable/chef agence validations exist. Not mentioned; acceptable for marketing.

5. **Rôles et permissions**  
   - Many roles (guichetier, chef agence, chef embarquement, etc.). Not listed; acceptable.

6. **Page publique compagnie / site par compagnie**  
   - Public company page, subdomain or slug. Not explicitly said on homepage; “réservations en ligne” and “billets numériques” hint at it.

---

## Part 6 — Suggestions for Improving Homepage Messaging

### 1. Align ProductShowcaseSection with real scope

- **Option A — Add one “Réservation en ligne” tab**  
  - Add a 6th tab “Réservation en ligne” (or “Vente en ligne”) that shows the module for online customer booking. Content: allow customers to book online, e-tickets, confirmations. This makes the main differentiator vs. pure guichet visible.

- **Option B — Fold “Réservation en ligne” into Ventes**  
  - Keep 5 tabs but in the “Ventes” tab show two blocks: Guichet (vente en agence) + Réservation en ligne (vente en ligne). So “Ventes” = all sales channels.

- **Option C — Add “Courrier” and “Flotte” to the showcase**  
  - Either add two tabs (Courrier, Flotte) or one “Opérations” tab that groups Embarquement + Courrier + Flotte (e.g. 3 sub-cards). Then “Une plateforme complète” and “toutes vos opérations” are accurate.

**Recommendation:** At least add **Réservation en ligne** to the tab bar (or under Ventes). Optionally add Courrier and Flotte (tabs or under Opérations) so the homepage is not missing major product areas.

### 2. Slight copy tweaks (optional)

- **Hero subtitle:** Add “et service courrier” if you add courrier to the showcase; e.g. “… réservations, embarquement, **courrier** et comptabilité”.
- **ProductShowcaseSection subtitle:** If you keep only 5 tabs, change “toutes vos opérations” to “vos opérations clés” or “l’essentiel de vos opérations” to avoid implying courrier and flotte are in the tabs.
- **TrustSection:** Add one short line on “Réservation en ligne pour vos clients” or “Vos clients réservent en ligne” if you want to stress it without listing every feature.

### 3. Keep marketing tone

- Do not list every role or validation flow. Keep the current level of detail for Problem, Solution, HowItWorks, Trust.
- PlatformStatsSection is good as-is (real data, no overstatement).
- Lead form and CTAs are appropriate.

### 4. Consistency check

- If Firestore `productPresentation` includes modules for “reservation-en-ligne”, “courrier”, “flotte”, ensure the **tab navigation** either includes them or clearly frames the 5 tabs as “core modules” and avoids the word “complète” / “toutes” unless you add the missing ones.

---

## Summary

| Criterion | Status |
|-----------|--------|
| **Accuracy of claims** | ✅ No false or misleading claims; hero, problem, solution, trust, stats, CTA are aligned with the product. |
| **Completeness of product representation** | ⚠️ ProductShowcaseSection shows 5 categories and omits **Réservation en ligne** (as a tab), **Courrier**, and **Flotte**. Hero and subtitles mention “réservations” and “comptabilité” but not “courrier” or “flotte”. |
| **Recommendation** | Add at least **Réservation en ligne** to the product showcase (tab or under Ventes). Optionally add **Courrier** and **Flotte** (tabs or under Opérations), and adjust “complète” / “toutes” wording so the marketing page accurately reflects TELIYA’s scope while staying clear and marketing-oriented. |
