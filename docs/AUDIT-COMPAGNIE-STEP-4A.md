# STEP 4A — COMPAGNIE MODULE VISUAL AUDIT

**Scope:** `src/modules/compagnie/` (all submodules)  
**Objective:** Identify all visual inconsistencies vs. the @/ui design system.  
**No files were modified;** this is preparation for STEP 4B (full migration).

---

## 1) Total number of Compagnie files analyzed

| Category | Count |
|----------|--------|
| **All .tsx files** | **90** |
| **Page-level .tsx** (under `pages/` or `public/pages/`) | **42** |
| **.ts only** (services, types, utils) | **30** (not audited for UI) |

**Audit focused on:** 90 TSX files (pages, layouts, components).

---

## 2) Files using legacy layout patterns

**Definition:** Custom outer wrappers (e.g. `max-w-* mx-auto p-4/p-6`, or raw `div` page shells) instead of `StandardLayoutWrapper` from @/ui.

- **StandardLayoutWrapper:** **Not used in any Compagnie file.** All pages use custom wrappers.

**Files with explicit legacy page wrappers (max-width + padding):**

| File | Pattern |
|------|---------|
| `public/pages/ResultatsAgencePage.tsx` | `min-h-screen p-4 sm:p-6`, `max-w-4xl mx-auto`, `max-w-7xl mx-auto` |
| `pages/CompanyGlobalFleetPage.tsx` | `space-y-6 p-4 md:p-6 max-w-6xl mx-auto` |
| `pages/GarageDashboardPage.tsx` | `p-4 sm:p-6 max-w-6xl mx-auto` |
| `pages/GarageDashboardHomePage.tsx` | `p-4 sm:p-6 max-w-6xl mx-auto` |
| `pages/CompanyPaymentSettingsPage.tsx` | `max-w-7xl mx-auto p-6` |
| `pages/CompanyFinancesPage.tsx` | `space-y-6 p-4 md:p-6 max-w-6xl mx-auto` |
| `public/pages/ReservationClientPage.tsx` | `max-w-[1100px] mx-auto px-3 sm:px-4 py-4` (multiple) |
| `public/pages/ConfidentialitePage.tsx` | `max-w-6xl mx-auto`, `max-w-4xl mx-auto px-6 py-8` |
| `public/pages/ReceiptEnLignePage.tsx` | `max-w-md mx-auto`, `min-h-screen p-6` |
| `pages/CompanySettings.tsx` | `p-4 md:p-6 space-y-6` |
| `components/parametres/ParametresReseauxPage.tsx` | `max-w-7xl mx-auto p-6` |
| `components/parametres/ParametresSecurite.tsx` | `max-w-7xl mx-auto` |

**Summary:** All Compagnie pages use legacy layout (no `StandardLayoutWrapper`). Layout is often driven by parent layout (e.g. `CompagnieLayout`, `GarageLayout`) which injects content; pages then add their own `max-w-*` / `p-*` containers.

---

## 3) Files not using PageHeader (@/ui)

**Definition:** No import of `PageHeader` from `@/ui`. Compagnie uses **PageHeaderContext** (`usePageHeader`, `setHeader`, `resetHeader`) so the layout renders the title in the shell; the @/ui **component** `PageHeader` is never used.

**Result:** **All 90 TSX files** do not use the @/ui `PageHeader` component.  
Pages that set a title use `setHeader({ title: "..." })` in the layout context instead.

**Files that set header via context (and thus would be candidates to optionally switch to in-page `<PageHeader />`):**  
TripCostsPage, AvisModerationPage, CEOPaymentApprovalsPage, CompanyFinancesPage, CEOTreasuryPage, RevenusLiquiditesPage, GarageDashboardPage, CompanyGlobalFleetPage, CompagnieParametresTabsPage, CompagnieInvitationsPage, CompagnieDashboard, CompanyPaymentSettingsPage, GarageDashboardHomePage, CEOCommandCenterPage, OperationsFlotteLandingPage, CompagnieAgencesPage, CompagnieReservationsPage.

**Public/standalone pages** (no layout shell) typically use raw `<h1>` / `<h2>` and also do not use @/ui `PageHeader`: e.g. AidePage, BibliothequeImagesPage, ReservationDetailsPage, UploadPreuvePage, ClientMesReservationsPage, ClientMesBilletsPage, etc.

---

## 4) Files with custom card implementations

**Definition:** Use of `rounded-xl border ... bg-white` (or similar) divs instead of `SectionCard` / `MetricCard` from @/ui.

| File | Notes |
|------|--------|
| `public/components/VilleSuggestionBar.tsx` | `rounded-xl border ... bg-white` cards |
| `public/pages/ConfidentialitePage.tsx` | Card-style div (rounded, border, bg-white) |
| `public/pages/ConditionsPage.tsx` | Same |
| `pages/CompanyFinancesPage.tsx` | `<section className="bg-white rounded-xl border p-4 shadow-sm">` (multiple) |
| `finances/pages/VueGlobale.tsx` | Many `rounded-xl border border-gray-200 ... bg-white` blocks |
| `finances/pages/ReservationsEnLignePage.tsx` | Multiple custom card divs + `StatCard` wrapper |
| `finances/pages/Rapports.tsx` | Multiple `rounded-xl border ... bg-white` sections |
| `public/pages/UploadPreuvePage.tsx` | Several `rounded-xl border ... bg-white` blocks |
| `public/components/AvisListePublic.tsx` | `rounded-2xl border ... bg-white` |
| `public/components/HeroSection.tsx` | Card-style div (backdrop) |
| `admin/components/CompanyDashboard/ChannelSplitChart.tsx` | `rounded-xl border ... bg-muted/20` |
| `pages/CEOCommandCenterPage.tsx` | `<section className="bg-white rounded-xl border p-3 sm:p-4 shadow-sm">` (×3) |
| `pages/CompanySettings.tsx` | `bg-white border ... rounded-xl` |
| `pages/OperationsFlotteLandingPage.tsx` | Multiple card divs |
| `admin/components/CompanyDashboard/KpiHeader.tsx` | Custom KPI card styling |
| `admin/components/CompanyDashboard/TimeFilterBar.tsx` | Button/card styling |
| `admin/components/messages/MessageItem.tsx` | `bg-white rounded-xl border ...` |
| `admin/components/company/PlanCard.tsx` | `bg-white rounded-xl border ...` |
| `components/parametres/ParametresServices.tsx` | Custom card divs |
| `components/parametres/ParametresSecurite.tsx` | `bg-white rounded-xl border p-6` |
| `components/parametres/ParametresPlan.tsx` | `<section className="bg-white border ... rounded-xl">` (multiple) |
| `pages/CompagnieParametresTabsPage.tsx` | `bg-white rounded-xl border p-8` |
| `pages/CompagnieComptabilitePage.tsx` | Many `bg-white rounded-xl border shadow-sm` blocks |
| `pages/CompagnieAgencesPage.tsx` | Multiple custom card/panel divs |
| `pages/CompanyPaymentSettingsPage.tsx` | `bg-white p-6 rounded-xl shadow-sm border` |
| `finances/pages/Finances.tsx` | Multiple custom card divs + local `KpiCard` |
| `components/parametres/ParametresReseauxPage.tsx` | `bg-white rounded-xl shadow-sm border` |
| `public/layout/CompanyPublicHeader.tsx` | Header bar (not a content card) |
| `pages/RevenusLiquiditesPage.tsx` | Tab / panel styling |
| `public/pages/ReceiptEnLignePage.tsx` | Bottom bar / layout divs |
| `components/parametres/ParametresBanques.tsx` | (forms; may have card-like wrappers) |
| `shared/ShiftsControlWidget.tsx` (if under compagnie) | Card divs |

**Summary:** **30+ files** use custom card-like structures instead of `SectionCard` / `MetricCard`.

---

## 5) Files with custom KPI implementations

**Definition:** Local `KpiCard` / `StatCard` or equivalent (label + value + optional icon) instead of @/ui `MetricCard`.

| File | Implementation |
|------|----------------|
| `finances/pages/Finances.tsx` | Local `KpiCard` component (lines ~397–430); used ×6 |
| `pages/CompagnieComptabilitePage.tsx` | Local `KpiCard` (lines ~1712+); used ×4 |
| `finances/pages/VueGlobale.tsx` | Local `KpiCard` (lines ~330+); used ×4 |
| `finances/pages/ReservationsEnLignePage.tsx` | Local `StatCard` (lines ~135+); used ×5 (À vérifier, En attente, Confirmées, etc.) |
| `admin/components/CompanyDashboard/KpiHeader.tsx` | Custom KPI-style header cards (label + value + color) |
| `admin/components/company/KpiTile.tsx` | Custom KPI tile (icon, label, value, hint) — not @/ui `MetricCard` |

**Summary:** **6 files** with custom KPI/stat card implementations.

---

## 6) Files with ad-hoc badge styling

**Definition:** Status/state shown via raw Tailwind (e.g. `rounded-full bg-green-100 text-green-800`) or local badge components instead of @/ui `StatusBadge`.

| File | Pattern |
|------|---------|
| `finances/pages/Rapports.tsx` | Local `StatusBadge` (generating/ready/failed) with custom colors |
| `commandCenter/CEOCommandCenterBlocks.tsx` | `text-red-600`, `text-amber-600`, `text-emerald-600` + emoji for health status |
| `pages/GarageDashboardPage.tsx` | `STATUS_BADGE_CLASS` map + `inline-flex px-2 py-0.5 rounded text-xs font-medium` for operational/technical status |
| `pages/CompagnieAgencesPage.tsx` | `inline-flex ... rounded-full ... bg-green-100 text-green-800` / `bg-red-100 text-red-800` for Active/Inactive |
| `components/parametres/ParametresPlan.tsx` | `rounded-full bg-amber-100 ... text-amber-700`, `rounded-full bg-green-100 ... text-green-700` (multiple) |
| `public/pages/ReservationDetailsPage.tsx` | `text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded` and status-based styling |
| `pages/CompagnieComptabilitePage.tsx` | `statutCaisse` and alert/card styling (ok/warning/danger) |

**Summary:** **7+ files** with ad-hoc badge or status styling instead of @/ui `StatusBadge`.

---

## 7) Files using inline layout styles

**Definition:** `style={{ ... }}` used for layout, colors, or spacing (theme colors and branding are acceptable in moderation; layout should prefer Tailwind/classes).

| File | Notes |
|------|--------|
| `admin/layout/CompagnieLayout.tsx` | `style={{ borderColor: ... }}`, `style={cssVars}` (CSS vars for theme) |
| `public/components/AgencyItem.tsx` | `style={{ color: primaryColor }}` (multiple) |
| `public/components/FinalCTA.tsx` | Background/theme styles |
| `components/parametres/ParametresServices.tsx` | `style={{ backgroundColor: '#2563eb' }}` |
| `public/pages/AidePage.tsx` | Border and background color |
| `public/components/PublicBottomNav.tsx` | Theme/active color |
| `components/parametres/ParametresBanques.tsx` | Multiple theme/outline styles |
| `admin/components/CompanyDashboard/KpiHeader.tsx` | Theme colors for KPI values |
| `finances/pages/Finances.tsx` | Gradient backgrounds, outline colors |
| `components/parametres/ParametresVitrine.tsx` | Border/theme |
| `public/components/AvisListePublic.tsx` | Theme colors |
| `pages/GarageDashboardHomePage.tsx` | Background color |
| `public/pages/ConditionsPage.tsx` | Background/border |
| `public/components/WhyChooseSection.tsx` | Theme styles |
| `public/components/LanguageSwitcher.tsx` | Active state background |
| `public/pages/ResultatsAgencePage.tsx` | Many inline styles (background, colors, borders) |
| `public/pages/ReservationDetailsPage.tsx` | Many (background, border, color) |
| `public/pages/UploadPreuvePage.tsx` | Many (theme, borders, backgrounds) |
| `public/components/ticket/TicketOnline.tsx` | Theme/accent colors |
| `admin/components/company/CompanyHeroHeader.tsx` | Brand/background colors |
| `public/pages/CookiesPage.tsx` | Theme colors |
| `admin/components/company/KpiTile.tsx` | CSS vars / colors |
| `public/pages/MentionsPage.tsx` | Border color |
| `public/pages/ClientMesReservationsPage.tsx` | Theme gradients and borders |
| `public/components/Footer.tsx` | Theme colors |
| `public/components/CompanyServices.tsx` | Theme styles |
| `public/components/AgencyList.tsx` | Theme and border |
| `pages/GarageDashboardPage.tsx` | Theme backgrounds and boxShadow |
| `public/pages/ReceiptEnLignePage.tsx` | Theme colors |
| `finances/pages/VueGlobale.tsx` | Theme/style object |

**Summary:** **28+ files** use inline `style={}` for layout, theme, or spacing (many for theme/branding; migration can replace where design tokens exist).

---

## 8) Estimated number of files requiring migration

| Category | Estimated count | Notes |
|----------|------------------|--------|
| **Pages/layouts to align with StandardLayoutWrapper + PageHeader** | **~25** | All pages under Compagnie that render main content; some may keep custom layout (e.g. public marketing). |
| **Replace custom cards with SectionCard / MetricCard** | **~30** | From list in §4. |
| **Replace custom KPI with MetricCard** | **6** | Finances, VueGlobale, ReservationsEnLigne, CompagnieComptabilite, KpiHeader, KpiTile. |
| **Replace ad-hoc badges with StatusBadge** | **7** | See §6. |
| **Reduce inline styles / use tokens** | **~28** | See §7; partial replacement where tokens exist. |
| **Button → ActionButton** | **~25+** | Many raw `<button>` across pages/components. |
| **DESIGN usage** | **1** | `admin/layout/CompagnieLayout.tsx` (import only; remove or replace). |
| **Local EmptyState** | **1** | `pages/BibliothequeImagesPage.tsx` (local `EmptyState`); replace with @/ui. |

**Overall:** Many files touch more than one category. A reasonable **upper bound of distinct files to touch** for a full STEP 4B migration is **~45–55** (excluding pure .ts and very small components). **Estimated 50 files** is a good planning figure.

---

## Summary table

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Total Compagnie files analyzed | **90** (.tsx) |
| 2 | Files using legacy layout patterns | **All page-level views** (no StandardLayoutWrapper) |
| 3 | Files not using PageHeader (@/ui) | **90** (none use the component; context used instead) |
| 4 | Files with custom card implementations | **30+** |
| 5 | Files with custom KPI implementations | **6** |
| 6 | Files with ad-hoc badge styling | **7+** |
| 7 | Files using inline layout styles | **28+** |
| 8 | Estimated files requiring migration (STEP 4B) | **~50** |

---

## Recommendations for STEP 4B

1. **Layout:** Introduce `StandardLayoutWrapper` (and optionally in-page `PageHeader`) in Compagnie admin/CEO/finances/parametres/garage/comptabilite pages; keep or adapt existing layout for public pages (ReservationClient, Receipt, etc.) as needed.
2. **Cards:** Replace repeated `rounded-xl border ... bg-white` sections with `SectionCard`; replace KPI blocks with `MetricCard`.
3. **Badges:** Replace local `StatusBadge` and ad-hoc span/div badges with @/ui `StatusBadge` and semantic status tokens.
4. **Buttons:** Replace primary action and secondary `<button>` with `ActionButton` where appropriate.
5. **DESIGN:** Remove unused `DESIGN` import from `CompagnieLayout.tsx` or replace with @/ui tokens.
6. **EmptyState:** Use @/ui `EmptyState` in `BibliothequeImagesPage` (and elsewhere as needed).
7. **Inline styles:** Prefer Tailwind and @/ui/design tokens; keep inline only for dynamic theme (e.g. company primary color) where no token exists.

This audit is the basis for STEP 4B (full migration) without any code changes applied in this step.
