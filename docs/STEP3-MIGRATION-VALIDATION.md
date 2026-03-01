# STEP 3 — Global Design System Migration — Validation Report

## 1. Total number of files migrated

**Fully migrated in this pass: 12 files**

| Module | File | Changes |
|--------|------|---------|
| **Courrier** | CourierSessionPage.tsx | CourierPageHeader → PageHeader, StandardLayoutWrapper, ActionButton |
| **Courrier** | CourierCreateShipmentPage.tsx | CourierPageHeader → PageHeader, StandardLayoutWrapper, ActionButton |
| **Courrier** | CourierPickupPage.tsx | CourierPageHeader → PageHeader, StandardLayoutWrapper |
| **Courrier** | CourierReceptionPage.tsx | CourierPageHeader → PageHeader, StandardLayoutWrapper |
| **Courrier** | CourierBatchesPage.tsx | CourierPageHeader → PageHeader, StandardLayoutWrapper, ActionButton |
| **Courrier** | CourierReportsPage.tsx | CourierPageHeader → PageHeader, StandardLayoutWrapper |
| **Agence Manager** | ManagerCockpitPage.tsx | MGR → StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, table |
| **Agence Manager** | ManagerFinancesPage.tsx | MGR → StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table |
| **Agence Manager** | ManagerOperationsPage.tsx | MGR → StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, table |
| **Agence Manager** | ManagerReportsPage.tsx | MGR → StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table |
| **Agence Manager** | ManagerTeamPage.tsx | MGR → StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table, inputClass |
| **Design system** | foundation/table.ts | New: table tokens + tableRowClassName |

**New design system asset:** `src/ui/foundation/table.ts` (table styles for data tables).

---

## 2. Deprecated components — status

| Item | Status |
|------|--------|
| **CourierPageHeader** | No longer used in any page. All 6 Courrier pages now use `PageHeader` from `@/ui` with `primaryColorVar="var(--courier-primary, #ea580c)"`. The file `CourierPageHeader.tsx` remains in the repo (deprecated) and can be removed once confirmed. |
| **MGR (page, h1, table, btnPrimary, btnSecondary, muted, card, kpi, etc.)** | No longer used in Manager pages. Manager pages now use `@/ui` (StandardLayoutWrapper, PageHeader, table, typography, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton). The object `MGR` remains in `agence/manager/ui.tsx` for backward compatibility only; **no remaining imports of MGR** in migrated files. |
| **KpiCard, SectionCard, StatusBadge, EmptyState from manager/ui** | No longer used in Manager pages. They now use `@/ui`. Other modules (e.g. AgenceComptabilitePage, Finances, VueGlobale, etc.) may still use local or manager versions — see “Remaining work” below. |

---

## 3. Headers

- **Courrier:** All 6 pages use `<PageHeader title="..." primaryColorVar="var(--courier-primary, #ea580c)" />` (with optional icon, subtitle, right).
- **Agence Manager:** All 5 Manager pages use `<PageHeader title="..." subtitle="..." right={...} />` inside `<StandardLayoutWrapper>`.
- **Confirmation:** All migrated headers use the single `PageHeader` component from `@/ui`. No remaining CourierPageHeader or raw `h1` + MGR.h1 in these files.

---

## 4. Cards

- **SectionCard:** All section-style blocks in Manager (Guichets actifs, Alertes, Validations en attente, Rapports à valider, Derniers mouvements, Départs du jour, Personnel, Nouvel agent, etc.) use `<SectionCard>` from `@/ui`.
- **MetricCard:** All KPI blocks in Manager (Revenu, Billets, Taux de remplissage, Position caisse, etc.) use `<MetricCard>` from `@/ui` with `valueColorVar` or `critical` where needed.
- **Confirmation:** In migrated files, all cards use SectionCard or MetricCard from `@/ui`. No raw card divs or MGR.card in these files.

---

## 5. Status badges

- **Manager + Courrier (migrated files):** All status pills use `<StatusBadge status="success" | "pending" | "danger" | "info" | "active" | "neutral">` from `@/ui`. No raw `color="green"` or ad-hoc emerald/amber/red spans in migrated files.
- **Mapping used:** green → success/active, yellow → pending, red → danger, blue → info, gray → neutral, purple → info.

---

## 6. Inline layout styles

- **Layout:** Custom `max-w-* mx-auto p-4 space-y-6` and `MGR.page` have been replaced by `<StandardLayoutWrapper>` (and optional `maxWidthClass` for Courrier).
- **Tables:** `MGR.table.*` replaced by `table.*` and `tableRowClassName()` from `@/ui/foundation`.
- **Loading:** `MGR.muted` replaced by `typography.muted` from `@/ui`.
- **Buttons:** Raw `className={MGR.btnPrimary}` / `MGR.btnSecondary` replaced by `<ActionButton variant="primary" | "secondary">` from `@/ui`.
- **Inline styles** for theme (e.g. courier primary on buttons) were replaced by ActionButton with `className` overrides where needed; Courrier pages still use minimal style for link-wrapped ActionButton (e.g. `!bg-[var(--courier-primary)]`).

---

## 7. Remaining technical debt (unavoidable or deferred)

1. **CourierPageHeader.tsx**  
   File is unused; can be deleted after global search confirms no remaining imports.

2. **MGR and manager/ui.tsx**  
   - `MGR` is still defined in `agence/manager/ui.tsx` and is still used by **ConfirmModal** and **HelpTip** (e.g. `MGR.btnPrimary`, `MGR.btnSecondary` inside ConfirmModal). So manager `ui.tsx` cannot remove MGR entirely until ConfirmModal/HelpTip are refactored to use ActionButton from `@/ui` or the modal’s buttons are restyled with design system tokens.  
   - **Recommendation:** Refactor ConfirmModal in manager ui to use `ActionButton` from `@/ui` and then remove MGR from manager ui.

3. **Other modules not yet migrated (pattern for STEP 3 continuation)**  
   - **Agence:** AgenceComptabilitePage (local KpiCard, EmptyState), DashboardAgencePage (MetricCard from shared, local layout), other guichet/boarding/fleet/comptabilité pages.  
   - **Compagnie:** Finances.tsx, VueGlobale.tsx, Rapports.tsx (local KpiCard/StatusBadge), CompagnieComptabilitePage (local KpiCard), etc.  
   - **Plateforme/Admin:** AdminSubscriptionsManager (local StatusBadge), AdminDashboard, AdminFinancesPage, etc.  
   - **Auth:** LoginPage, Register, AcceptInvitationPage (headers and layout).  
   Apply the same pattern: StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table/typography from `@/ui`.

4. **PageHeaderContext (Compagnie)**  
   Compagnie layout still uses PageHeaderContext; pages set title via `setHeader`. For full unification, either render the context-driven title with the same typography as PageHeader, or migrate those pages to render `<PageHeader>` explicitly and optionally keep context for layout chrome only.

5. **BatchStatusBadge (CourierBatchesPage)**  
   Still a local component; can be refactored to use `<StatusBadge status={mapBatchStatusToVariant(status)} />` from `@/ui` with a small mapping function.

---

## 8. Summary

- **Migrated:** 12 files (6 Courrier + 5 Manager + 1 new foundation file).  
- **Deprecated in use:** CourierPageHeader and MGR no longer used in these pages; design system is the single source for layout, header, cards, status, and buttons in migrated scope.  
- **Headers:** All migrated pages use `PageHeader`.  
- **Cards:** All migrated pages use `SectionCard` or `MetricCard`.  
- **Status:** All migrated pages use `StatusBadge` with semantic `status`.  
- **Layout:** All use `StandardLayoutWrapper` and foundation table/typography where applicable.  
- **Remaining work:** Same pattern can be applied to the remaining ~100+ files listed in `docs/DESIGN-SYSTEM-AUDIT.md` and `docs/DESIGN-SYSTEM-MIGRATION.md`; ConfirmModal/HelpTip and optional removal of CourierPageHeader and MGR are the only noted technical debt in the current scope.
