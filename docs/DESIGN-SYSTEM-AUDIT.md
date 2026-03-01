# TELIYA — Global Design System Audit (STEP 1)

**Scope:** Internal platform only — Agence, Comptable, CEO, Guichet, Courrier.  
**Objective:** Identify all visual and structural inconsistencies to prepare a single design system and global refactor.  
**No code has been modified.** This document is the audit summary only.

---

## 1. EXECUTIVE SUMMARY

The internal platform is built from multiple modules (agence, compagnie, plateforme, courrier, guichet, comptabilité) that each evolved with local patterns. There is a **global design token file** (`src/app/design-system.ts`) and a **shared layout** (`InternalLayout`) used by the Agence shell, but:

- **Design tokens are barely used** outside `InternalLayout` and `button.tsx`.
- **Module-specific token sets** exist (e.g. `MGR` in `agence/manager/ui.tsx`) and duplicate or diverge from the global tokens.
- **Page titles, cards, buttons, badges, and spacing** are implemented ad hoc in dozens of files with no single component or class set.
- **Inline styles** are used in 100+ module files for colors and layout, which blocks theme consistency and dark mode.
- **Layout wrappers** differ by module (max-width, padding, vertical spacing).

Result: the product looks like **several mini-apps** (Agence vs Compagnie vs Admin vs Courrier) rather than one unified SaaS.

---

## 2. TYPOGRAPHY INCONSISTENCIES

### 2.1 Page titles (H1)

| Pattern | Example classes | Where used |
|--------|------------------|------------|
| DESIGN / MGR | `text-2xl font-bold` (no color) or `MGR.h1` = `text-2xl font-bold text-gray-900` | InternalLayout; ManagerCockpitPage, ManagerFinancesPage |
| Admin/Plateforme | `text-2xl font-bold text-gray-900`, `text-2xl font-bold mb-4`, `text-2xl font-bold mb-6` | AdminCompagniesPage, AdminParametresPlatformPage, AdminStatistiquesPage, AdminFinancesPage, AdminRevenueDashboard, AdminCompanyDetail, AdminModifierCompagniePage, AdminReservationsPage, AdminSubscriptionsManager, PlansManager, ListeVillesPage, AjouterPersonnelPlateforme, AdminCompanyPlan |
| Compagnie | `text-xl font-semibold mb-2`, `text-2xl font-bold text-gray-900`, `text-2xl font-bold` | CompagnieDashboard, CompagnieReservationsPage, ReservationsEnLignePage, ParametresPersonnel, ParametresVitrine, CompagnieComptabilitePage, MessagesCompagniePage, BibliothequeImagesPage |
| Agence (non-Manager) | `text-2xl md:text-3xl font-bold` + `style={{ color: theme.colors.primary }}`, `text-xl font-semibold`, `text-2xl font-bold text-gray-800` | DashboardAgencePage, FleetVehiclesPage, AgenceRapportsPage, ProfilAgentPage, BoardingDashboardPage, AgenceFleetOperationsPage |
| Courrier | `CourierPageHeader` (custom component, h1 with primary color) | CourierSessionPage, CourierCreateShipmentPage, CourierReceptionPage, CourierPickupPage, CourierBatchesPage, CourierReportsPage |
| Public / Auth | `text-xl font-bold`, `text-lg font-bold`, `font-semibold text-base` | UploadPreuvePage, ReceiptEnLignePage, ClientMesReservationsPage, ClientMesBilletsPage, AidePage, AcceptInvitationPage, Register, ReservationDetailsPage, ConfidentialitePage |

**Conclusion:** No single `PageHeader` or title component. At least **6–7 different H1 patterns** (size, weight, margin, color). DESIGN.typography.h1 and MGR.h1 exist but are used only in a subset of Agence Manager pages.

### 2.2 Section titles (H2)

- **DESIGN.typography.h2** = `text-lg font-semibold text-gray-900` (defined, rarely imported).
- **MGR.h2** = `text-lg font-semibold text-gray-900` (used in SectionCard in agence/manager).
- Elsewhere: mix of `text-lg font-semibold`, `text-xl font-bold`, `text-base font-semibold`, with gray-800, gray-900, or no color.

### 2.3 Labels and muted text

- **DESIGN**: `label` = `text-sm font-medium text-gray-700`, `muted` = `text-sm text-gray-500`.
- **MGR.muted** = `text-sm text-gray-500`.
- Many files use ad hoc `text-xs text-gray-500`, `text-sm text-gray-600`, etc.

**Files with typography variance (sample):**  
AdminParametresPlatformPage, AdminStatistiquesPage, AdminFinancesPage, AdminCompagniesPage, AdminRevenueDashboard, AdminCompanyDetail, AdminModifierCompagniePage, AdminSubscriptionsManager, PlansManager, ListeVillesPage, AjouterPersonnelPlateforme, AdminCompanyPlan, CompagnieDashboard, CompagnieReservationsPage, ReservationsEnLignePage, ParametresPersonnel, ParametresVitrine, CompagnieComptabilitePage, MessagesCompagniePage, BibliothequeImagesPage, DashboardAgencePage, FleetVehiclesPage, AgenceRapportsPage, ProfilAgentPage, BoardingDashboardPage, AgenceFleetOperationsPage, UploadPreuvePage, ReceiptEnLignePage, ClientMesReservationsPage, ClientMesBilletsPage, AidePage, AcceptInvitationPage, Register, ReservationDetailsPage, ConfidentialitePage, RouteResolver, RevenusLiquiditesPage, CEOPaymentApprovalsPage, CompanyFinancesPage, GarageDashboardPage, CEOCommandCenterPage, and most other internal pages.

---

## 3. SPACING INCONSISTENCIES

### 3.1 Page-level wrapper

| Source | Pattern | Used in |
|--------|---------|--------|
| DESIGN | `pagePadding` = `p-4 md:p-6`, `pageWidth` = `max-w-7xl mx-auto`, `verticalSpacing` = `space-y-6` | InternalLayout (main content wrapper) |
| MGR | `page` = `max-w-7xl mx-auto p-4 md:p-6 space-y-6` | ManagerCockpitPage, ManagerFinancesPage, ManagerReportsPage, ManagerOperationsPage, ManagerTeamPage |
| Ad hoc | `max-w-7xl mx-auto px-4 py-6`, `max-w-6xl mx-auto p-4`, `p-4 md:p-6`, `px-4 pb-6`, etc. | Many Compagnie, Admin, Agence (non-Manager), Courrier, Guichet pages |

### 3.2 Card internal spacing

- **shared Card:** CardHeader/CardContent use `p-6`.
- **MGR SectionCard:** header `px-5 py-4`, body `p-5` or noPad.
- **MGR KpiCard:** `p-5`.
- Raw card divs: `p-4`, `p-5`, `px-4 pt-4`, `px-5 py-4`, etc.

### 3.3 Gaps and vertical rhythm

- `space-y-4`, `space-y-6`, `space-y-8`, `gap-2`, `gap-3`, `gap-4`, `gap-6` used without a single scale. No shared spacing scale (e.g. 4/8/12/16/24/32).

**Affected areas:** All modules; any file that uses `p-*`, `gap-*`, `space-*`, `max-w-*` for page or section layout.

---

## 4. CARD STYLE INCONSISTENCIES

### 4.1 Defined standards (underused)

- **DESIGN** / **dsCard:** `rounded-xl border border-gray-200 bg-white shadow-sm`.
- **shared Card** (card.tsx): same visual (rounded-xl, border, bg-white, shadow-sm), with CardHeader, CardTitle, CardContent.
- **MGR.card:** same base; used in SectionCard/KpiCard with different internal padding.

### 4.2 Ad hoc card patterns in codebase

- `rounded-xl border border-gray-200 bg-white shadow-md` (shadow-md vs shadow-sm).
- `rounded-lg border border-gray-200 ...` (rounded-lg vs rounded-xl).
- `bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600` (duplicated in many files).
- `rounded-xl border shadow-sm` without explicit border color (relies on global border).
- Cards with `p-4`, `p-5`, `p-6` inconsistently.

### 4.3 Duplicated “section card” concept

- **agence/manager:** `SectionCard` (title bar + body, MGR.card).
- **Compagnie / Admin:** Many pages build equivalent structure with raw divs (rounded-xl, border, title row, content) instead of a shared SectionCard.

**Files with card inconsistency (sample):**  
CompagnieComptabilitePage, CompagnieDashboard, GarageDashboardPage, AgenceComptabilitePage, AgenceRecettesPage, VueGlobale, Finances, Rapports, Parametres, CEOTreasuryPage, CEOPaymentApprovalsPage, TripCostsPage, CompagnieReservationsPage, CompagnieAgencesPage, ManagerOperationsPage, FleetDashboardPage, AgenceGuichetPage, CourierSessionPage, CourierBatchesPage, AdminParametresPlatformPage, AdminDashboard, AdminSubscriptionsManager, PlansManager, and most list/detail pages that use a “card” layout.

---

## 5. BUTTON STYLE INCONSISTENCIES

### 5.1 Central definitions

- **DESIGN.button:** primary/secondary use `rounded-lg`, `min-h-[44px]`, theme colors.
- **shared/ui/button.tsx:** uses DESIGN, variants default/sm/lg/icon, destructive.

### 5.2 Module-specific buttons

- **MGR:** `btnPrimary` = emerald-600 (hardcoded), `btnSecondary` = border gray, `btnDanger` = red-600. **Does not use company primary.**
- **Courrier / Compagnie / Admin:** Many `<button className="...">` with inline Tailwind: `px-3 py-2 rounded-lg`, `px-4 py-2`, `bg-orange-600`, `bg-emerald-600`, `border border-gray-300`, etc.

### 5.3 Inconsistencies

- Primary actions: sometimes theme primary (var or company color), sometimes orange-600, sometimes emerald-600.
- Heights: min-h-[44px], h-10, py-2, py-2.5.
- Radius: rounded-lg vs rounded-xl vs rounded-md.

**Files with button variance:** Most pages with actions (ManagerTeamPage, ManagerOperationsPage, CompagnieReservationsPage, AgenceComptabilitePage, CourierCreateShipmentPage, AdminCompagniesPage, PlansManager, etc.).

---

## 6. STATUS BADGE INCONSISTENCIES

### 6.1 Shared component

- **shared/ui/badge.tsx:** Only `default` (bg-gray-100, text-gray-800) and `outline`. No semantic status colors.

### 6.2 Agence Manager

- **MGR StatusBadge:** green, yellow, red, gray, blue, purple (bg-*-100, text-*-800). Used in ManagerCockpitPage, ManagerFinancesPage, ManagerTeamPage, etc.

### 6.3 Ad hoc badges elsewhere

- Raw spans: `bg-emerald-100 text-emerald-800`, `bg-amber-100 text-amber-800`, `bg-red-100 text-red-800`, `rounded-full px-2.5 py-0.5 text-xs font-medium`, etc. in Compagnie, Courrier, Guichet, Comptabilité.

**Conclusion:** No single StatusBadge API (e.g. status="success" | "warning" | "error" | "info") used across modules. Shared Badge is not status-semantic; MGR.StatusBadge is used only in part of Agence.

**Files with status/badge variance:** AgenceReservationsPage, ManagerTeamPage, CompagnieReservationsPage, ReservationsEnLignePage, Finances, Rapports, AgenceComptabilitePage, CourierBatchesPage, CourierSessionPage, ShiftHistoryPage, GuichetSessionCard, and any list/table that shows status.

---

## 7. PAGE HEADER INCONSISTENCIES

### 7.1 Patterns

- **PageHeaderContext (CompagnieLayout):** Pages call `setHeader({ title, subtitle, right })`; layout renders header. Used in CompagnieDashboard, CompagnieReservationsPage, CEOCommandCenterPage, CEOPaymentApprovalsPage, CompanyFinancesPage, GarageDashboardPage, CompagnieAgencesPage, TripCostsPage, OperationsFlotteLandingPage, RevenusLiquiditesPage, CompanyPaymentSettingsPage, ParametresPlan, CompagnieParametresTabsPage, AvisModerationPage, BibliothequeImagesPage, CompanyGlobalFleetPage, MediaPage, etc.
- **CourierPageHeader:** Dedicated component (icon + title, primary color). Used by all Courrier pages.
- **Agence Manager:** In-page `<h1 className={MGR.h1}>` or inline h1; no shared header component.
- **Admin / Plateforme:** In-page `<h1 className="text-2xl font-bold ...">` with varying margins and optional actions; no shared PageHeader.
- **Guichet / Boarding / Fleet:** Mix of in-page h1 and custom bars.

### 7.2 Result

- No single **PageHeader** component (title + optional subtitle + actions) used across Agence, Admin, Compagnie, Courrier, Guichet. Compagnie uses context; others use local h1 or custom header.

**Affected files:** All internal pages that render a title (see typography list). Layouts: InternalLayout, CompagnieLayout, CompanyAccountantLayout, GarageLayout, BoardingLayout, and each module’s page components.

---

## 8. INLINE STYLES THAT BREAK CONSISTENCY

Inline `style={{ }}` is used for:

- **Colors:** `style={{ color: theme.colors.primary }}`, `style={{ color: primary }}`, `style={{ backgroundColor: ... }}`. Prevents using a single token/component and complicates dark mode.
- **Widths/heights:** `style={{ minWidth: ... }}`, `style={{ height: ... }}` where Tailwind or tokens could be used.
- **Spacing/sizing:** ad hoc padding or font size in style.

**Count:** 100+ files under `src/modules` contain `style={{`.  
**Sample (high impact):** DashboardAgencePage, VueGlobale, Finances, Rapports, Parametres, AgenceComptabilitePage, ManagerTeamPage, CourierSessionLivePanel, AgenceGuichetPage, CompagnieAgencesPage, CompanyPaymentSettingsPage, TripCostsPage, CEOTreasuryPage, GarageDashboardPage, CompagnieReservationsPage, AdminParametresPlatformPage, AdminSubscriptionsManager, PlansManager, AdminCompagnieAjouterPage, FleetAssignmentPage, AgenceEmbarquementPage, and many courrier/guichet/comptabilité components.

---

## 9. LAYOUT STRUCTURE DIFFERENCES BETWEEN MODULES

### 9.1 Shells and content area

| Module | Layout shell | Content wrapper pattern |
|--------|--------------|-------------------------|
| Agence (Manager) | InternalLayout (sidebar + header) | DESIGN.pageWidth + DESIGN.pagePadding in main |
| Agence (Guichet, Boarding, Fleet) | Dedicated layout (e.g. BoardingLayout) | Often custom div with max-w-7xl or similar |
| Compagnie (CEO) | CompagnieLayout (sidebar) + PageHeaderProvider | Content uses setHeader; page content varies (max-w-7xl, padding ad hoc) |
| Compagnie (Accounting) | CompanyAccountantLayout | Similar to Compagnie, content wrapper not standardized |
| Garage | GarageLayout | Own structure |
| Courrier | CourierLayout (wrapper only, no sidebar) inside Agence | Courier pages use max-w-* and padding locally |
| Admin / Plateforme | AdminSidebarLayout or similar | max-w-7xl mx-auto px-4 md:px-6 or equivalent in many pages |

### 9.2 Content width and padding

- **InternalLayout:** `max-w-7xl mx-auto` + `p-4 md:p-6` (from DESIGN).
- **MGR.page:** `max-w-7xl mx-auto p-4 md:p-6 space-y-6`.
- **Other pages:** `max-w-7xl mx-auto px-4 py-6`, `max-w-6xl mx-auto p-4`, or no max-width. Some use only padding without centering.

Result: **Different content width and padding per module/page**, so the “content band” is not visually unified.

---

## 10. AFFECTED FILES (NON-EXHAUSTIVE LIST)

### 10.1 Agence (manager, guichet, boarding, fleet, comptabilité, courrier)

- **Manager:** ManagerCockpitPage, ManagerFinancesPage, ManagerReportsPage, ManagerOperationsPage, ManagerTeamPage, ui.tsx (MGR, SectionCard, StatusBadge, EmptyState, KpiCard).
- **Dashboard / métriques:** DashboardAgencePage, ManagerDashboardPage, MetricCard, NextDepartureCard, TopTrajetsCard, RevenueChart, ChannelsChart, DestinationsChart.
- **Guichet:** AgenceGuichetPage, ReceiptGuichetPage, ReservationPrintPage, ShiftHistoryPage, GuichetSessionCard, GuichetRapportPanel, ModifierReservationForm, ReceiptModal, pos/* (SalePanel, PosSessionBar, SessionSummaryModal, etc.).
- **Boarding:** BoardingLayout, BoardingDashboardPage, BoardingScanPage.
- **Fleet:** FleetDashboardPage, FleetAssignmentPage, FleetVehiclesPage, FleetMovementLogPage, AgenceFleetOperationsPage.
- **Comptabilité agence:** AgenceComptabilitePage, AgenceRecettesPage, AgenceFinancesPage.
- **Courrier:** CourierSessionPage, CourierCreateShipmentPage, CourierReceptionPage, CourierPickupPage, CourierBatchesPage, CourierReportsPage, CourierPageHeader, CourierSessionLivePanel, CourierReceipt, CourierPackageLabel, AgencySearchSelect.
- **Other:** AgenceRapportsPage, ProfilAgentPage, AgenceReservationsPage, AgenceTrajetsPage, AgenceShiftPage, AgenceShiftHistoryPage, AgencePersonnelPage, ChefAgencePersonnelPage, AgencyTreasuryPage, AgenceEmbarquementPage, ShiftsControlWidget, ValidateShiftModal, ChefApprovalModal.

### 10.2 Compagnie (CEO, accounting, garage, paramètres, finances)

- **CEO / Command center:** CEOCommandCenterPage, CEOPaymentApprovalsPage, CEOTreasuryPage, CEOCommandCenterBlocks, CompagnieDashboard.
- **Finances:** VueGlobale, Finances, Rapports, Parametres, ReservationsEnLignePage, ChefComptableCompagnie, RevenusLiquiditesPage, CompanyFinancesPage, CompanyPaymentSettingsPage.
- **Pages:** CompagnieReservationsPage, CompagnieAgencesPage, CompagnieComptabilitePage, CompagnieParametresTabsPage, CompagnieInvitationsPage, TripCostsPage, OperationsFlotteLandingPage, GarageDashboardPage, GarageDashboardHomePage, CompanyGlobalFleetPage, BibliothequeImagesPage, AvisModerationPage, MessagesCompagniePage, CompanySettings, DepensesPage, AjouterAgenceForm.
- **Paramètres:** ParametresPlan, ParametresPersonnel, ParametresLegauxPage, ParametresServices, ParametresBanques, ParametresReseauxPage, ParametresVitrine, ParametresSecurite.
- **Layouts:** CompagnieLayout, CompanyAccountantLayout, GarageLayout.
- **Admin compagnie:** CompanyHeroHeader, PlanCard, KpiHeader, KpiTile, AlertsPanel, CriticalAlertsPanel, NetworkHealthSummary, TimeFilterBar, etc.

### 10.3 Plateforme / Admin

- AdminDashboard, AdminCompagniesPage, AdminCompanyDetail, AdminModifierCompagniePage, AdminCompagnieAjouterPage, AdminCompanyPlan, AdminReservationsPage, AdminFinancesPage, AdminStatistiquesPage, AdminParametresPlatformPage, AdminParametresPage, AdminSubscriptionsManager, AdminRevenueDashboard, AdminAgentsPage, MediaPage, PlansManager, ListeVillesPage, AjouterPersonnelPlateforme, PlatformSearchResultsPage, Header, Footer, PlatformHeader, HeroSection, FeaturesSection, PartnersSection, TestimonialsSection, SearchForm, PopularCities.

### 10.4 Auth

- LoginPage, Register, AcceptInvitationPage.

### 10.5 Shared / design system

- **Used today:** src/app/design-system.ts, src/shared/layout/InternalLayout.tsx, src/shared/ui/button.tsx, src/shared/ui/card.tsx, src/shared/ui/badge.tsx.
- **Not used globally:** dsCard, dsPage, dsSectionTitle, dsKpiLabel, dsMonetary (except in limited places). DESIGN.typography is referenced in design-system but rarely in modules.

---

## 11. EXISTING ASSETS TO REUSE

- **design-system.ts:** DESIGN (radius, cardShadow, cardBorder, pagePadding, pageWidth, verticalSpacing, typography, button, layout, zIndex, defaultTheme), dsCard, dsPage, dsSectionTitle, dsKpiLabel, dsMonetary.
- **shared/ui/card.tsx:** Card, CardHeader, CardTitle, CardContent, CardFooter — used in ~25 module files but not everywhere a “card” is needed.
- **shared/ui/button.tsx:** Uses DESIGN; variants. Used in a few places; many buttons are still raw.
- **shared/ui/badge.tsx:** Only default/outline; no status semantics.
- **agence/manager/ui.tsx:** MGR (page, h1, h2, muted, card, kpi, table, alert, dot, input, btnPrimary/Secondary/Danger), SectionCard, KpiCard, StatusBadge, EmptyState, AlertItem, HelpTip, ConfirmModal. Good candidate to generalize and move to shared design system.
- **PageHeaderContext:** Used by Compagnie; layout renders title/subtitle/actions. Concept can be generalized to a single PageHeader component consumed by all shells.
- **CourierPageHeader:** Single component for Courrier; can become a variant of a unified PageHeader.

---

## 12. RECOMMENDATIONS FOR STEP 2 (DESIGN SYSTEM FOUNDATION)

1. **Single spacing scale** — e.g. 4, 8, 12, 16, 24, 32 (Tailwind 1–8), and map page/card gaps to it.
2. **Single typography scale** — page title, section title, body, label, muted; all from DESIGN or extended DESIGN.
3. **One PageHeader component** — title, optional subtitle, optional actions; support theme primary; used by all layouts/pages.
4. **One SectionCard component** — title bar (optional icon, right slot) + body; reuse dsCard/MGR.card style.
5. **One MetricCard/KpiCard component** — label, value, optional icon, optional help; reuse from agence/dashboard or MGR with theme support.
6. **Unified StatusBadge** — variants: success, warning, error, info, neutral (and optional custom); replace MGR.StatusBadge and ad hoc spans.
7. **Unified ActionButton** — primary, secondary, danger, ghost; use DESIGN + theme; replace MGR buttons and ad hoc buttons.
8. **One EmptyState component** — icon optional, message; replace local EmptyState definitions (e.g. AgenceComptabilitePage, BibliothequeImagesPage, manager/ui).
9. **StandardLayoutWrapper** — one wrapper for “page content” (max-width + padding + vertical spacing) used inside every shell.
10. **Shadow and radius** — use DESIGN.radius, DESIGN.cardRadius, DESIGN.cardShadow everywhere; no ad hoc rounded-* or shadow-* for cards.
11. **Status colors** — map to a single palette (e.g. success=emerald, warning=amber, error=red, info=blue) and use via StatusBadge or token.
12. **Remove inline styles for theme** — use CSS variables (--teliya-primary, etc.) and classes or design system components so theme and dark mode stay consistent.

---

## 13. SCOPE OF REFACTOR (STEP 3)

- **Typography:** Replace all ad hoc h1/h2/label/muted with design system classes or PageHeader/SectionCard titles. **Roughly 80+ files.**
- **Cards:** Replace raw card divs with Card or SectionCard from design system. **Roughly 60+ files.**
- **Buttons:** Replace ad hoc and MGR buttons with shared ActionButton (or button.tsx) using theme. **Roughly 50+ files.**
- **Badges:** Replace MGR.StatusBadge and ad hoc status spans with shared StatusBadge. **Roughly 25+ files.**
- **Page header:** Introduce PageHeader and use in all internal pages (or via layout). **All internal page components.**
- **Layout wrapper:** Use StandardLayoutWrapper (or DESIGN.pageWidth + pagePadding + verticalSpacing) in every shell’s content area. **All layout and page files that define content width/padding.**
- **Inline styles:** Replace theme/size inline styles with tokens and components. **100+ files.**

Total **affected files** (with possible overlap): **~120–150+** across modules. No business logic or routing changes; only UI structure, class names, and component usage.

---

*End of STEP 1 — Full UI Audit. Proceed to STEP 2 (Design System Foundation) when approved.*
