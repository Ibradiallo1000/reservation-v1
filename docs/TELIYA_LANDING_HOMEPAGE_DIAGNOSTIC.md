# TELIYA Marketing Homepage — Diagnostic Report

**Date:** 2025-03-04  
**Scope:** Full analysis of the current landing implementation, routing, components, Firestore configuration, and gaps vs. intended marketing structure.

---

## 1. Homepage Routing

### How "/" is resolved

- **File:** `src/AppRoutes.tsx`
- **Route:** `<Route path="/" element={<Suspense><SubdomainAwareHome /></Suspense>} />`
- **SubdomainAwareHome** (lines 218–221):
  - If **subdomain** (e.g. `malitrans.teliya.app` or `slug.localhost`): renders **RouteResolver**
  - Otherwise (e.g. `teliya.app` or `localhost`): renders **HomePage**

### Subdomain detection

- **Function:** `isPublicSubdomain()` in `AppRoutes.tsx`
- **Logic:** `host.endsWith(".teliya.app") && host !== "teliya.app"` OR `host.endsWith(".localhost") && host !== "localhost"`
- So: **main domain** → marketing **HomePage**; **company subdomain** → **RouteResolver** (company public site).

### RouteResolver behavior (company "/")

- **File:** `src/modules/compagnie/public/router/RouteResolver.tsx`
- **Slug source:** Subdomain (e.g. `malitrans` from `malitrans.teliya.app`) or first path segment (e.g. `/malitrans/...`)
- **Role:** Loads company by slug from Firestore, then renders company-specific public pages (PublicCompanyPage, ReservationClientPage, etc.) or 404.
- **Path "/" on subdomain:** Typically resolves to the company’s public home (e.g. PublicCompanyPage).

### Routing flow summary

| URL / context              | Rendered component |
|----------------------------|--------------------|
| `https://teliya.app/`      | **HomePage** (marketing) |
| `https://localhost:5173/`   | **HomePage** (marketing) |
| `https://malitrans.teliya.app/` | **RouteResolver** → company public home |
| `https://teliya.app/malitrans`   | **RouteResolver** → company public (slug = `malitrans`) |

**Conclusion:** The marketing homepage is rendered only on the **main domain** at path **"/"**. Company pages are rendered via **RouteResolver** on company subdomains or on `/:slug/*` on the main domain.

---

## 2. Current Homepage Structure

### HomePage.tsx — sections in order

**File:** `src/modules/plateforme/pages/HomePage.tsx`

1. **Header**
2. **HeroSection**
3. **Divider** (gradient line)
4. **ProblemSection**
5. **SolutionSection**
6. **HowItWorksSection**
7. **ProductShowcaseSection**
8. **TrustSection**
9. **PlatformStatsSection**
10. **FinalCTASection**
11. **RequestDemoSection**
12. **FloatingDemoButton** (fixed, outside main)
13. **Footer**

### Old vs current structure

- **Current:** Marketing structure as above (Hero, Problem, Solution, HowItWorks, ProductShowcase, Trust, Stats, Final CTA, Request Demo, Floating button, Footer).
- **Old structure:** PartnersSection, FeaturesSection, TestimonialsSection — **not used** in HomePage. These components still exist in `src/modules/plateforme/components/` but are **not imported** in HomePage.

**Conclusion:** The homepage **uses the intended marketing structure**. The old sections (Partners, Features, Testimonials) are present in the codebase but are **not** rendered on "/".

---

## 3. Existing Landing Components

### Directory: `src/modules/plateforme/components/`

| Component                 | Present | Used in HomePage |
|--------------------------|--------|-------------------|
| HeroSection              | ✅     | ✅                |
| ProblemSection           | ✅     | ✅                |
| SolutionSection          | ✅     | ✅                |
| HowItWorksSection        | ✅     | ✅                |
| ProductShowcaseSection   | ✅     | ✅                |
| TrustSection             | ✅     | ✅                |
| PlatformStatsSection     | ✅     | ✅                |
| FinalCTASection          | ✅     | ✅                |
| RequestDemoSection       | ✅     | ✅                |
| FloatingDemoButton       | ✅     | ✅                |
| Header                   | ✅     | ✅                |
| Footer                   | ✅     | ✅                |
| PartnersSection          | ✅     | ❌ (legacy)       |
| FeaturesSection          | ✅     | ❌ (legacy)       |
| TestimonialsSection      | ✅     | ❌ (legacy)       |
| CTASection               | ✅     | ❌                |
| SearchForm               | ✅     | ❌                |
| PopularCities            | ✅     | ❌                |

**Missing components:** None. All 10 marketing sections plus Header and Footer exist and are used. Legacy components (Partners, Features, Testimonials) exist but are unused on the marketing homepage.

---

## 4. Firestore Configuration

### Document: `platform/settings`

The homepage (and related components) read from **`platform/settings`** in the following places:

| Setting / usage              | Implemented | Where used |
|-----------------------------|-------------|------------|
| **hero.bannerImage**        | ✅          | HeroSection: `data?.hero?.bannerImage` (fallback: `banniereUrl`) |
| **banniereUrl**             | ✅          | HeroSection (fallback), Admin params |
| **productPresentation**     | ✅          | ProductShowcaseSection (array of modules) |
| **trustCards**              | ❌          | TrustSection uses only i18n (landing.whyCard1–4), not Firestore |
| **Contact (footer)**        | ✅          | Footer: `footer.contactPhone`, `footer.contactEmail`, `contact.phone`, `contact.email` |
| **Social links**            | ✅          | Footer: `social.facebook`, `social.linkedin`, `social.twitter` |
| **Footer content**         | ✅          | Footer: `footer.about`, `footer.mission`, `platformName`, `slogan` (+ EN variants) |
| **legalLinks**              | ✅          | Footer (labels + URLs, with labelEn) |
| **logoUrl**                 | ✅          | Header (logo in nav bar) |

### Firestore rules (platform)

- **platform/settings:** `get: if true`; create/update/delete: `isAuth() && getUserRole() == 'admin_platforme'`
- **platformLeads:** create: `true`; get/list: `isAuth() && getUserRole() == 'admin_platforme'`; update/delete: `false`

**Conclusion:** Hero banner, product presentation, contact, social, footer content, and legal links are implemented. **trustCards** from Firestore is **not** implemented; Trust section is i18n-only.

---

## 5. Product Showcase System

### Connection to Firestore

- **ProductShowcaseSection** loads `platform/settings` once and reads `productPresentation`.
- If `productPresentation` exists and is a non-empty array, it is used (filtered by `enabled !== false`, sorted by `displayOrder`).
- If not, **DEFAULT_PRODUCT_PRESENTATION** from `src/modules/plateforme/types/productPresentation.ts` is used.

### Default modules (in code)

All 8 default modules exist in `DEFAULT_PRODUCT_PRESENTATION`:

1. **direction** — Direction  
2. **agences** — Agences  
3. **guichet** — Guichet  
4. **reservation-en-ligne** — Réservation en ligne  
5. **embarquement** — Embarquement  
6. **courrier** — Courrier  
7. **flotte** — Flotte  
8. **comptabilite** — Comptabilité  

### Merge behavior

- **No merge per module:** Either the full Firestore `productPresentation` array is used, or the full default list. There is no field-by-field merge (e.g. Firestore title + default description).
- **Admin:** Admin Paramètres plateforme can edit and persist `productPresentation` (FR/EN for title, description, features; imageUrl; enabled; displayOrder).
- **i18n:** Section title and per-module title/description/features use i18n keys when no custom EN is set in settings; configurable EN (titleEn, descriptionEn, featuresEn) is used when present and language is EN.

**Conclusion:** Product showcase is correctly connected to `platform/settings.productPresentation`. Default modules are complete. Behavior is “all Firestore or all defaults,” not per-module merge.

---

## 6. Lead Form System

### RequestDemoSection

- **File:** `src/modules/plateforme/components/RequestDemoSection.tsx`
- **Form target:** `#lead-form` (section id used by FloatingDemoButton and FinalCTASection for scroll).

### Firestore

- **Collection:** `platformLeads`
- **Method:** `addDoc(collection(db, "platformLeads"), { ... })`
- **Fields stored:**
  - `name` (string or null)
  - `email` (string, required)
  - `company` (string or null)
  - `message` (string or null)
  - `createdAt` (JavaScript `Date`; Firestore stores as Timestamp)

### Security

- Rules allow **create: if true** for unauthenticated users; **get/list** only for `admin_platforme`; **update/delete: false`.

### Functionality

- Submit, loading state, success/error message, form reset on success, i18n for labels/placeholders/buttons/messages.
- **Minor:** `createdAt` is passed as `new Date()`. Firestore client typically converts it to Timestamp; for consistency you could use `serverTimestamp()` or `Timestamp.now()`.

**Conclusion:** Lead capture is implemented and functional; data is saved to `platformLeads` with the fields above and rules are correctly set.

---

## 7. Header System

### Implemented

| Feature            | Status | Notes |
|--------------------|--------|--------|
| **Language selector** | ✅ | FR/EN buttons; persistence via `localStorage.setItem("i18nextLng", …)` before `changeLanguage`; i18n detector reads from localStorage on load |
| **Dark/light mode**   | ✅ | Cycle system → dark → light; persisted in `teliya:theme`; `document.documentElement.classList.toggle("dark", …)` |
| **Sticky behavior**   | ✅ | `sticky top-0 z-50`; scroll state used for `backdropFilter` when `scrollY > 20` |
| **Logo**              | ✅ | From `platform/settings.logoUrl` with fallback to `/images/teliya-logo.jpg`; cached in `teliya:lastLogoUrl`; size ~ 32px (h-8 w-8) in a rounded container |
| **Navigation links**  | ⚠️  | Only “home” (logo click → `/`) and “login” (User icon → `/login`). No “Mes réservations” or other nav links on landing |

### Possible improvements

- Use `platformName` from settings for the header brand text (currently hardcoded “Teliya”).
- Optional: add a small “Admin” link for admins (or keep admin access via direct URL).
- Ensure logo aspect ratio and max size are consistent across breakpoints.

**Conclusion:** Header is implemented with language selector, theme, sticky behavior, and dynamic logo. Main gap is optional: dynamic platform name and any extra nav items.

---

## 8. What Was Lost / Reverted (vs. intended)

From the conversation history and current code:

### Not lost — currently in place

- Marketing section order and composition (Hero through Request Demo + Floating button + Footer).
- All 10 marketing section components exist and are used.
- Hero banner from Firestore (`hero.bannerImage` / `banniereUrl`), with cache.
- Product showcase connected to `productPresentation` with 8 default modules.
- Footer and contact/social/legal from `platform/settings` with FR/EN.
- Lead form saving to `platformLeads` with correct rules.
- Header with language, theme, sticky, logo.
- i18n for landing (FR/EN) and language persistence.
- Platform stats from Firestore (companies, agencies, reservations) via `usePlatformStats`.

### Not implemented (optional / future)

- **trustCards** from Firestore: Trust section is i18n-only; no admin-configurable trust cards.
- **Per-module merge** for product showcase: no merge of Firestore modules with default modules; all or nothing.
- **list** on `platform/settings`: rules only mention `get`; if any code used `list` (e.g. collection), it would need an explicit `list` rule (currently single-doc `getDoc` only, so not required for current usage).

### Previously reverted then restored

- HomePage had temporarily reverted to old structure (PartnersSection, FeaturesSection, TestimonialsSection); this was restored to the current marketing structure, which is still in place.

**Conclusion:** The intended marketing homepage structure is present and wired. Nothing critical is missing; only optional enhancements (e.g. configurable trust cards, platform name in header) remain.

---

## 9. Recommendations

### Design

- Keep section spacing and card styles consistent (e.g. `py-[40px] md:py-[70px]`, rounded cards, orange accents).
- Consider one more pass on contrast and focus states for accessibility (buttons, links, form fields).

### Configuration

- Add **trustCards** in `platform/settings` and in Admin (title/description per card, optional icon/order) and use them in TrustSection when present; fallback to i18n.
- Use **platformName** from settings in the Header instead of hardcoded “Teliya”.
- Optional: support **list** on `platform/settings` in rules if you ever query it as a collection.

### Mobile

- Keep current responsive grids and touch targets; test FloatingDemoButton and footer links on small screens.
- Ensure Hero CTA buttons and Request Demo form are comfortable on mobile (already appear adequate).

### Conversion

- Optional: add simple analytics or tracking on “Request demo” submit and CTA clicks.
- Optional: add a clear “See how it works” or “Demo” CTA in the hero that scrolls to HowItWorks or to the lead form.

### Stability

- Avoid replacing HomePage imports with legacy sections (PartnersSection, FeaturesSection, TestimonialsSection); consider deleting or moving legacy components to a `/legacy` folder to avoid accidental reuse.
- Add a short comment at the top of HomePage.tsx listing the intended section order so future edits don’t revert the structure.

---

## 10. Structured Summary

### Current architecture

- **Route "/":** SubdomainAwareHome → main domain: **HomePage** (marketing); subdomain: **RouteResolver** (company site).
- **HomePage:** Header + Hero → Problem → Solution → HowItWorks → ProductShowcase → Trust → PlatformStats → FinalCTA → RequestDemo + FloatingDemoButton + Footer.
- **Data:** Hero and logo from `platform/settings`; product modules from `productPresentation` or defaults; footer/contact/social/legal from `platform/settings`; stats from Firestore counts (companies, agences, reservations); leads to `platformLeads`.

### Missing components

- **None.** All marketing sections and Header/Footer exist and are used.

### Configuration status

| Item              | Status |
|-------------------|--------|
| hero.bannerImage  | ✅     |
| productPresentation | ✅   |
| contact / social / footer | ✅ |
| legalLinks        | ✅     |
| trustCards        | ❌ (i18n only) |
| platformName in header | ⚠️ Optional (not used in header) |

### Lead capture status

- **Implemented:** RequestDemoSection submits to `platformLeads` with name, email, company, message, createdAt.
- **Rules:** create allowed for all; read for admin only; no update/delete.
- **UX:** Success/error state, i18n, form reset; FloatingDemoButton and FinalCTA scroll to `#lead-form`.

### Header status

- **Implemented:** Language (FR/EN with persistence), dark/light/system theme (persisted), sticky with scroll blur, dynamic logo from Firestore, home + login.
- **Optional:** Use `platformName` from settings; add more nav links if needed.

### Restoration plan

- **No restoration required.** The marketing homepage is in place and consistent with the intended structure.
- **Optional next steps:**
  1. Add Firestore-driven **trustCards** and wire TrustSection (with i18n fallback).
  2. Use **platformName** in Header.
  3. Document or remove legacy components (PartnersSection, FeaturesSection, TestimonialsSection) to avoid accidental reversion.
  4. Add a one-line comment in HomePage.tsx documenting the intended section order.

---

*End of diagnostic report.*
