# TELIYA — Global Performance Audit & Optimization

**Mission:** Frontend performance, bundle structure, code splitting, lazy loading, assets, initial load.  
**Scope:** No business logic, Firestore structure, reservation engine, Courier logic, or dashboard logic changes.

---

# PHASE 1 — FULL TECHNICAL AUDIT (NO CHANGES)

## PART A — Bundle Analysis

### 1. Current total build size
- **Not measured in this audit** (build failed in sandbox). To obtain: run `npm run build` and sum `dist/assets/js/*.js` + `dist/assets/css/*.css`. Estimate from dependency count: **large** (Firebase, React, recharts, leaflet, i18next, emotion, etc.).

### 2. Initial JS bundle loaded on public home
- **Entry:** `index.html` → `main.tsx` → `index.tsx` → `App` → `AppRoutes`.
- **Always loaded (no route-based splitting):**
  - `firebaseConfig.ts` (via `index.tsx` → `initFirebase()`): Firebase App, Firestore, Auth, Storage, Functions, App Check.
  - `App.tsx`: AuthProvider, AppRoutes, UpdateBanner, GlobalConnectionBanner.
  - `contexts/AuthContext.tsx`: Firebase `onIdTokenChanged`, `signOut`, Firestore `doc/getDoc/setDoc/query/collection/updateDoc/where/serverTimestamp/Timestamp` — **Firebase is in the initial bundle** because AuthProvider wraps the whole app.
  - `AppRoutes.tsx` and **all its static imports** (see below).
  - `index.css`: includes `@import 'leaflet/dist/leaflet.css'` — **Leaflet CSS is in the global CSS** even though Leaflet is only used in Compagnie (agences map).
  - `i18n.ts`: i18next, react-i18next, i18next-browser-languagedetector — loaded from `index.tsx` (via main entry).

### 3. What is loaded when visiting SaaS dashboard?
- Same as above, plus when navigating to e.g. `/admin` or `/agence/dashboard`: the **lazy** chunk for AdminSidebarLayout / ManagerShellPage and their children. Recharts and dashboard charts are inside those lazy chunks (AdminDashboard, ManagerCockpitPage, etc.), so they are **not** in the initial bundle but load on first dashboard visit.

### 4. Are public and SaaS routes separated or mixed in initial chunk?
- **Mixed.** The **route definitions** and **statically imported components** in `AppRoutes.tsx` are all in the same module graph as the entry:
  - **Static imports in AppRoutes.tsx** (file refs):
    - `RouteResolver` — `src/modules/compagnie/public/router/RouteResolver.tsx` (uses Firestore)
    - `AdminCompanyPlan` — `src/modules/plateforme/pages/AdminCompanyPlan.tsx`
    - `PlansManager` — `src/modules/plateforme/pages/PlansManager.tsx`
    - `MentionsPage`, `ConfidentialitePage`, `ConditionsPage`, `CookiesPage`, `ReservationDetailsPage` — public pages but **statically imported**
    - `AdminParametresPlatformPage`
    - `ValidationComptablePage`, `ValidationChefAgencePage`, `ChefComptableCompagniePage`
    - `VueGlobale`, `ReservationsEnLigne`, `Finances`, `Rapports`, `Parametres` — `@/modules/compagnie/finances/pages`
    - `ReservationPrintPage` — agence guichet
  - So **public and SaaS are not separated**: a single “app” chunk (or a small set of chunks from Vite’s default splitting) contains route tree + RouteResolver + many admin/compagnie/agence components.

### 5. Are dashboards statically imported anywhere in App.tsx or root files?
- **App.tsx:** No dashboard imports. Only: AuthProvider, AppRoutes, UpdateBanner, GlobalConnectionBanner.
- **Root (index.tsx, main.tsx):** No dashboard imports. Only: initFirebase, App, index.css, i18n, error handlers.
- **AppRoutes.tsx:** Yes. Admin/Compagnie/Agence **layouts and pages** used in `<Route element={...}>` are mostly **lazy**, but **AdminCompanyPlan, PlansManager, VueGlobale, ReservationsEnLigne, Finances, Rapports, Parametres, ValidationComptablePage, ValidationChefAgencePage, ChefComptableCompagniePage, ReservationPrintPage**, and the public pages listed above are **statically imported**. So a significant part of “dashboard” and “public” code is in the same chunk as AppRoutes.

### 6. Are Courier modules loaded on public pages?
- **Courier route components** (CourierLayout, CourierSessionPage, etc.) are **lazy** in AppRoutes, so they are **not** loaded until the user hits an agence route that renders them.
- **RouteResolver** is statically imported in AppRoutes; RouteResolver itself does not import Courier. So on a **public-only** visit (e.g. `/` or `/:slug` vitrine), Courier is not loaded. But **RouteResolver** and all **static** AppRoutes imports are loaded, so the **initial bundle** still includes RouteResolver (and its Firestore usage) and all statically imported pages.

### 7. Are charts and heavy components loaded eagerly?
- **recharts:** Used in AdminDashboard, AdminStatistiquesPage, AdminFinancesPage, CompagnieDashboard (RevenueReservationsChart, ChannelSplitChart), AgenceRecettesPage, AgenceComptabilitePage, VueGlobale, Rapports, agency dashboard (RevenueChart, ChannelsChart, DestinationsChart), etc. All of these are behind **lazy** route components, so recharts is **not** in the initial bundle; it loads when the user opens a dashboard that uses it.
- **Leaflet:** CSS is eager (`index.css` → `@import 'leaflet/dist/leaflet.css'`). Leaflet JS is only in `CompagnieAgencesPage` and `AjouterAgenceForm` (lazy). So **Leaflet CSS is eager**, Leaflet JS is lazy.
- **Heavy components:** InternalLayout, PrivateRoute, ProtectedRoute, and all statically imported pages above are eager relative to the AppRoutes chunk.

**Exact file references (summary):**
- Entry: `index.html` → `src/main.tsx` → `src/index.tsx` → `src/App.tsx` → `src/AppRoutes.tsx`.
- Firebase: `src/firebaseConfig.ts` (init), `src/contexts/AuthContext.tsx` (auth + firestore), `src/modules/compagnie/public/router/RouteResolver.tsx` (firestore).
- Global CSS: `src/index.css` (leaflet.css import at line 2).
- Static route components: `src/AppRoutes.tsx` lines 11–29 (import list).

---

## PART B — Code Splitting Audit

### 1. All React.lazy usages
- **AppRoutes.tsx (lines 31–114):** HomePage, PlatformSearchResultsPage, LoginPage, Register, ListeVillesPage, AcceptInvitationPage, ReservationClientPage, ClientMesReservationsPage, ClientMesBilletsPage, AdminSidebarLayout, AdminDashboard, AdminCompagniesPage, AdminModifierCompagniePage, AdminStatistiquesPage, AdminReservationsPage, AdminFinancesPage, AdminCompagnieAjouterPage, AdminSubscriptionsManager, AdminRevenueDashboard, CompagnieLayout, GarageLayout, CompanyAccountantLayout, CompagnieDashboard, CEOCommandCenterPage, CEOPaymentApprovalsPage, CompanyFinancesPage, GarageDashboardPage, GarageDashboardHomePage, CEOTreasuryPage, CompagnieAgencesPage, CompagnieParametresTabsPage, CompagnieReservationsPage, CompagnieComptabilitePage, BibliothequeImagesPage, CompanyPaymentSettingsPage, AvisModerationPage, RevenusLiquiditesPage, OperationsFlotteLandingPage, TripCostsPage, ParametresPlan, ManagerShellPage, ManagerCockpitPage, ManagerOperationsPage, ManagerFinancesPage, ManagerTeamPage, ManagerReportsPage, AgenceTrajetsPage, AgencyTreasuryPage, AgenceGuichetPage, ReceiptGuichetPage, AgenceComptabilitePage, BoardingLayout, BoardingDashboardPage, BoardingScanPage, FleetLayout, FleetDashboardPage, FleetAssignmentPage, FleetVehiclesPage, FleetMovementLogPage, AgenceFleetOperationsPage, CourierLayout, CourierDashboardPage, CourierSessionPage, CourierCreateShipmentPage, CourierReceptionPage, CourierPickupPage, CourierReportsPage, CourierBatchesPage, MediaPage, DebugAuthPage.
- **RouteResolver.tsx (lines 22–31):** PublicCompanyPage, ResultatsAgencePage, ReservationClientPage, ClientMesReservationsPage, ClientMesBilletsPage, MentionsPage, ConfidentialitePage, ReceiptEnLignePage, UploadPreuvePage, ReservationDetailsPage, AidePage.

### 2. Large modules NOT lazy-loaded
- **RouteResolver** — contains Firestore, getDocs, onSnapshot, company resolution logic; used only for `/:slug/*`.
- **AdminCompanyPlan, PlansManager** — admin.
- **MentionsPage, ConfidentialitePage, ConditionsPage, CookiesPage, ReservationDetailsPage** — public (could be lazy).
- **AdminParametresPlatformPage** — admin.
- **ValidationComptablePage, ValidationChefAgencePage, ChefComptableCompagniePage** — workflows.
- **VueGlobale, ReservationsEnLigne, Finances, Rapports, Parametres** — compagnie finances (heavy, with recharts in some).
- **ReservationPrintPage** — agence guichet.
- **PrivateRoute, ProtectedRoute** — auth wrappers (light; acceptable).
- **PageHeaderProvider, AuthCurrencyProvider, routePermissions** — light.

### 3. Static imports that should be lazy
- **RouteResolver** — only used for `/:slug/*`; should be lazy so that the public home `/` does not pull Firestore and company resolution.
- **AdminCompanyPlan, PlansManager** — only used under `/admin`; already have lazy AdminSidebarLayout, but these are direct static elements.
- **MentionsPage, ConfidentialitePage, ConditionsPage, CookiesPage, ReservationDetailsPage** — only used under `/:slug/...` or specific paths; should be lazy to reduce initial bundle.
- **AdminParametresPlatformPage, ValidationComptablePage, ValidationChefAgencePage, ChefComptableCompagniePage, VueGlobale, ReservationsEnLigne, Finances, Rapports, Parametres, ReservationPrintPage** — used only on specific routes; should be lazy.

### 4. Suspense fallback structure
- **AppRoutes.tsx (line 220):** `<Suspense fallback={null}>` wraps the whole `<Routes>`. No visible loader during lazy load (relies on native orange splash / null).
- **RouteResolver.tsx (line 271):** `<Suspense fallback={null}>` around public lazy pages. No nested redundant Suspense; structure is acceptable.

### 5. Public and SaaS route separation
- **Not separated.** One Routes tree, one AppRoutes module. Public routes (`/`, `/:slug/*`) and SaaS routes (`/admin`, `/agence`, `/compagnie`) share the same chunk as long as their route elements are statically imported. Lazy elements are split; static ones are not.

---

## PART C — Firebase Usage Audit

### 1. Is Firebase initialized once or multiple times?
- **Once.** `firebaseConfig.ts` uses `getApps().length ? getApp() : initializeApp(firebaseConfig)`. `initFirebase()` is called once in `index.tsx` (BootWrapper useEffect) before rendering the app.

### 2. Is there a single src/lib/firebase.ts?
- **No.** The single entry is **`src/firebaseConfig.ts`**. There is also `src/lib/firebaseClient.ts` (referenced in `src/utils/functions.ts`). So two Firebase-related modules; initialization is in `firebaseConfig.ts`.

### 3. Are Firebase imports duplicated across chunks?
- **Yes, potentially.** Many modules import `db` or `auth` from `@/firebaseConfig` or `firebaseConfig` (50+ files). Each lazy chunk that uses Firebase will contain its own dependency on `firebaseConfig` (and thus Firebase SDK) unless Vite/Rollup puts Firebase in a shared chunk. Current `manualChunks` in `vite.config.ts` (lines 87–96) put `node_modules/firebase` in a `firebase` chunk, so Firebase SDK should be in one chunk; but `firebaseConfig.ts` (app code) may still be duplicated or pulled into multiple chunks depending on static vs lazy imports. **AuthContext** and **RouteResolver** both import from `@/firebaseConfig` and are on the critical path (AuthContext) or static (RouteResolver), so Firebase is definitely in the initial load.

### 4. Is Firebase included in initial public bundle?
- **Yes.** AuthProvider (and thus AuthContext) wraps the app and imports `auth`, `db` from `@/firebaseConfig`. So Firebase Auth + Firestore are in the initial bundle. RouteResolver is also statically imported and uses Firestore, reinforcing that Firestore is needed for the “app” chunk.

---

## PART D — Asset Optimization Audit

### 1. Hero image size (kb)
- **Not measured** (no access to `public/images` file sizes in audit). Hero reference: `HeroSection.tsx` uses `url(/images/hero-bus.jpg)` and index.html preloads `hero-fallback.jpg`. Recommend measuring with build or filesystem.

### 2. Are images WebP?
- **Unknown** from code. References: `/images/hero-bus.jpg`, `/images/hero-fallback.jpg`, `/images/teliya-logo.svg`, `/images/partner-placeholder.png`. No `.webp` references found; hero is `.jpg`.

### 3. Any images larger than 500kb?
- **Not measured.** Should be checked in `public/images` (and any dynamic image URLs).

### 4. Are large images lazy-loaded when possible?
- **Hero:** Not lazy-loaded; it is the LCP element. Acceptable.
- **Other images:** No systematic `loading="lazy"` audit performed. Recommendation: add `loading="lazy"` for below-the-fold images and use WebP where possible.

### 5. Is fetchPriority used correctly on hero image?
- **HeroSection.tsx** uses CSS `backgroundImage: url(/images/hero-bus.jpg)`. There is no `<img>` with `fetchpriority="high"`. For an LCP hero, using an `<img>` with `fetchPriority="high"` (and optionally `loading="eager"`) is recommended; CSS background images cannot set fetchPriority.

---

## PART E — Routing & Suspense

### 1. Does public load SaaS modules unnecessarily?
- **Yes.** The **route tree** and all **statically imported** components of AppRoutes (RouteResolver, AdminCompanyPlan, PlansManager, VueGlobale, Finances, etc.) load with the app. So when a user visits only `/` or `/:slug`, they still download the module graph of AppRoutes, including RouteResolver (and its Firestore usage) and every statically imported page. Only the **lazy** route components are deferred.

### 2. Does SaaS load public modules unnecessarily?
- **Yes.** There is no separate SaaS entry. Visiting `/admin` or `/agence` loads the same initial bundle as `/`; then additional lazy chunks for Admin/Agence. So public code (e.g. HomePage chunk when already cached, or RouteResolver in the main chunk) is already there.

### 3. Is there redundant Suspense nesting?
- **No.** One Suspense in AppRoutes (fallback=null), one in RouteResolver (fallback=null). No nested Suspense around the same content.

### 4. Any full-screen loader still active?
- **No.** Loading states: `if (loading && !isHome) return null` (AppRoutes); RouteResolver `if (loading) return null`. Suspense fallbacks are `null`. No full-screen React loader; native orange splash only.

---

# PHASE 2 — AUDIT REPORT (SUMMARY)

## 1. Current architecture summary
- **Single SPA:** One HTML entry, one React tree (AuthProvider → AppRoutes → Routes). Firebase is initialized once in `firebaseConfig.ts`; AuthProvider uses it for auth and user/company loading.
- **Routing:** Centralized in AppRoutes; public (`/`, `/:slug/*`), admin (`/admin`), agence (`/agence`), compagnie (`/compagnie/:companyId`) share the same tree. Many route components are lazy; a significant set is statically imported (RouteResolver + ~15 pages/layouts).
- **Chunks:** Vite `manualChunks` split by `node_modules` (react, firebase, vendor) and by **path** (`/src/pages/Compagnie/`, `/src/pages/Agence/`, `/src/pages/Admin/`). The codebase uses **`src/modules/`** not `src/pages/`, so these path conditions **never match**; compagnie/agence/admin are not isolated into separate chunks by current config.

## 2. Current weaknesses
- **No public-only bundle:** Initial load includes AuthContext (Firebase) + AppRoutes + RouteResolver + all static route imports.
- **RouteResolver and Firestore on every visit:** RouteResolver is static and uses Firestore; it is only needed for `/:slug/*`.
- **Leaflet CSS global:** Leaflet CSS in `index.css` loads for all routes although only Compagnie agences/map use it.
- **manualChunks paths outdated:** They reference non-existent paths, so no effective separation of Compagnie/Agence/Admin code.
- **Statically imported pages:** Many admin, compagnie, and public pages are static in AppRoutes, increasing the size of the chunk that contains AppRoutes.

## 3. Critical performance issues
1. **Firebase in initial bundle** — Required for auth; could be deferred until after first paint or until a route needs it (e.g. lazy AuthProvider or lazy Firebase init), but that would require architectural change.
2. **RouteResolver and Firestore in initial bundle** — RouteResolver is only for `/:slug/*`; should be lazy so that `/` and other non-slug routes do not pull it.
3. **~15 statically imported route components** — Admin, Compagnie, and public pages increase initial bundle; they should be lazy.
4. **manualChunks not matching** — Paths like `/src/pages/Compagnie/` do not exist; Compagnie/Agence/Admin are not split into dedicated chunks.

## 4. Medium impact issues
1. **Leaflet CSS in global CSS** — Loaded on every page; should be imported only where Leaflet is used (e.g. CompagnieAgencesPage, AjouterAgenceForm) or in a lazy chunk.
2. **No fetchPriority on hero** — Hero is CSS background; cannot set fetchPriority; consider switching to `<img fetchPriority="high">` for LCP.
3. **i18n and detectors in main entry** — i18next + LanguageDetector load up front; could be lazy if not needed for first paint.
4. **Duplicate lazy definitions** — Some pages (e.g. ReservationClientPage, MentionsPage) are lazy in both AppRoutes and RouteResolver; ensure they resolve to the same chunk to avoid duplication.

## 5. Low impact issues
1. **Preloads in index.html** — Preload of hero-fallback, logo, partner-placeholder may be good; verify they are used and not over-preloading.
2. **chunkSizeWarningLimit: 1500** — High; some chunks may be large; monitor after splitting.

## 6. Estimated bundle waste percentage
- **Rough estimate:** 25–40% of the “app” chunk could be deferred for a public-only visit (RouteResolver + Firestore in RouteResolver + all statically imported pages + Leaflet CSS). The exact number depends on actual build output; run `npm run build` and analyze with `vite-bundle-visualizer` or Rollup output.

---

# PHASE 3 — OPTIMIZATION PLAN (PROPOSED, NOT IMPLEMENTED)

## 1. Public / SaaS chunk separation strategy
- **Goal:** Minimize what loads for path `/` and optional `/:slug` vitrine.
- **Actions:**
  - Lazy-load **RouteResolver** so it (and its Firestore usage) is not in the initial bundle. **File:** `AppRoutes.tsx`. **Change:** Replace `import RouteResolver from "..."` with `const RouteResolver = lazy(() => import("..."))` and wrap its `<Route path="/:slug/*" element={<RouteResolver />} />` in `<Suspense fallback={null}>`.
  - Convert all **statically imported** route components in AppRoutes to **lazy**: AdminCompanyPlan, PlansManager, MentionsPage, ConfidentialitePage, ConditionsPage, CookiesPage, ReservationDetailsPage, AdminParametresPlatformPage, ValidationComptablePage, ValidationChefAgencePage, ChefComptableCompagniePage, VueGlobale, ReservationsEnLigne, Finances, Rapports, Parametres, ReservationPrintPage. **File:** `AppRoutes.tsx`. **Change:** Remove static imports; add `const X = lazy(() => import("..."))` and use in routes. **Gain:** Smaller initial chunk; public home no longer pulls these modules.
- **Expected gain:** Significant reduction in initial JS (order of hundreds of kB depending on current size).

## 2. Lazy loading plan per module
| Module / component        | Current       | Proposed     | File(s)        |
|---------------------------|---------------|-------------|----------------|
| RouteResolver             | Static        | lazy        | AppRoutes.tsx  |
| AdminCompanyPlan          | Static        | lazy        | AppRoutes.tsx  |
| PlansManager              | Static        | lazy        | AppRoutes.tsx  |
| MentionsPage             | Static        | lazy        | AppRoutes.tsx  |
| ConfidentialitePage      | Static        | lazy        | AppRoutes.tsx  |
| ConditionsPage           | Static        | lazy        | AppRoutes.tsx  |
| CookiesPage               | Static        | lazy        | AppRoutes.tsx  |
| ReservationDetailsPage   | Static        | lazy        | AppRoutes.tsx  |
| AdminParametresPlatformPage | Static      | lazy        | AppRoutes.tsx  |
| ValidationComptablePage   | Static        | lazy        | AppRoutes.tsx  |
| ValidationChefAgencePage  | Static        | lazy        | AppRoutes.tsx  |
| ChefComptableCompagniePage| Static        | lazy        | AppRoutes.tsx  |
| VueGlobale, Finances, etc.| Static        | lazy        | AppRoutes.tsx  |
| ReservationPrintPage      | Static        | lazy        | AppRoutes.tsx  |

## 3. Firebase chunk isolation plan
- **Current:** `vite.config.ts` already has `if (id.includes('firebase')) return 'firebase'` for `node_modules`. Keep it.
- **Optional (larger refactor):** Defer Firebase init until first route that needs auth (e.g. lazy AuthProvider or lazy firebaseConfig). Not recommended in Phase 4 if we want to avoid auth logic changes; keep Firebase in initial load for now.
- **File:** `vite.config.ts`. **Change:** Ensure `firebaseConfig.ts` is not duplicated: avoid static import of firebaseConfig in both a “main” chunk and RouteResolver by making RouteResolver lazy (so firebaseConfig is only in the chunk that needs it after AuthContext). **Gain:** Firebase SDK already in one chunk; app code that uses it (e.g. RouteResolver) moved to lazy chunk.

## 4. Manual chunk configuration for Vite
- **File:** `vite.config.ts` (rollupOptions.output.manualChunks).
- **Change:** Replace paths that reference `/src/pages/Compagnie/`, `/src/pages/Agence/`, `/src/pages/Admin/` with paths that exist, e.g.:
  - `id.includes('/modules/compagnie/')` → `'compagnie'`
  - `id.includes('/modules/agence/')` → `'agence'`
  - `id.includes('/modules/plateforme/')` or `id.includes('/modules/auth/')` for admin → `'admin'` (or split plateforme vs admin if desired)
- **Gain:** Compagnie, Agence, Admin (and optionally Public) become separate chunks; better caching and smaller initial load when only one area is used.

## 5. Dashboard chart defer strategy
- **Current:** recharts is already behind lazy route components (AdminDashboard, CompagnieDashboard, etc.). No change required for “defer” beyond keeping those routes lazy.
- **Optional:** Lazy-load recharts inside dashboard pages (e.g. `const Chart = lazy(() => import('recharts').then(m => ({ default: m.BarChart })))`) to further shrink the chunk that loads when entering dashboard. **File:** Dashboard pages that use recharts. **Change:** Dynamic import recharts where used. **Gain:** Slightly smaller dashboard chunk; more complexity. **Recommendation:** Low priority; keep as is unless bundle analysis shows recharts as a dominant cost.

## 6. Image optimization improvements
- **Hero:** Prefer `<img src="/images/hero-bus.jpg" fetchPriority="high" alt="..." />` (or WebP with fallback) instead of CSS background in HeroSection so the browser can prioritize LCP. **File:** `HeroSection.tsx` (or equivalent hero component). **Change:** Use img + fetchPriority; optionally add WebP and `sizes`/srcset if responsive.
- **Images > 500kb:** Audit `public/images` and convert large assets to WebP; add `loading="lazy"` for below-the-fold images. **Files:** Public assets and components that render images.
- **Gain:** Better LCP, lower bandwidth.

## 7. Preconnect / preload improvements
- **Current:** index.html has preconnect for firebasestorage, firestore, googleapis; preload for teliya-logo.svg, hero-fallback.jpg, partner-placeholder.png.
- **Change:** Ensure hero image used for LCP (e.g. hero-bus.jpg) is the one preloaded if it is the same as hero-fallback; otherwise add preload for hero-bus.jpg. Remove or defer preload for images that are not LCP. **File:** `index.html`. **Gain:** Better LCP, no wasted preloads.

---

# PHASE 4 — IMPLEMENTATION (ONLY AFTER VALIDATION)

To be executed **only after validation** of the plan above:

1. **Chunk separation:** Apply manualChunks path fixes and lazy RouteResolver + static-to-lazy conversions in AppRoutes.
2. **Lazy loading:** Convert all listed static route components to lazy in AppRoutes; add Suspense where needed.
3. **Vite manualChunks:** Update vite.config.ts as in section 4.
4. **Assets:** Hero img + fetchPriority; image audit and WebP/lazy where appropriate; preload tuning in index.html.
5. **Leaflet CSS:** Move `leaflet/dist/leaflet.css` import from index.css to the modules that use Leaflet (CompagnieAgencesPage, AjouterAgenceForm) or to a shared “map” lazy chunk.

Deliverables after implementation:
- List of modified files.
- New bundle size (run `npm run build` and report).
- % improvement vs. current (or vs. estimated current).
- Confirmation that no business logic, Firestore structure, reservation engine, Courier logic, or dashboard logic was changed.

---

# FINAL OBJECTIVE CHECKLIST

| Objective                         | Status / Note                                           |
|----------------------------------|---------------------------------------------------------|
| Public under 700kb initial JS    | To be measured after Phase 4; lazy RouteResolver + static→lazy will reduce. |
| Separate SaaS bundle             | manualChunks + lazy routes will separate Compagnie/Agence/Admin. |
| Separate Firebase chunk          | Already in place for node_modules; keep; reduce duplication by lazy RouteResolver. |
| No dashboard load for public     | Dashboards are already lazy; ensure no static imports pull them (Phase 3.1–3.2). |
| Improve LCP and TTI              | Hero fetchPriority, image optimization, smaller initial JS. |
| Maintain architecture integrity  | No change to business logic, Firestore, reservation, Courier, dashboard logic. |

---

*End of audit and optimization plan.*
