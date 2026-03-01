# Courier Visual Consistency — Validation Report

## Objective

Make the Courier submenu (Guichet/Chef Guichetier) visually **identical** to other main modules by replacing all custom card containers with design system components.

---

## 1) List of Files Modified

| File | Changes |
|------|---------|
| `src/modules/agence/courrier/components/CourierSessionLivePanel.tsx` | Replaced outer `section` (rounded-xl border bg-white) with `SectionCard`; replaced 8 KPI `div`s with `MetricCard` (valueColorVar for theme). |
| `src/modules/agence/courrier/pages/CourierPickupPage.tsx` | Replaced 2 custom `section` cards with `SectionCard` (Recherche, Détails envoi). |
| `src/modules/agence/courrier/pages/CourierCreateShipmentPage.tsx` | Replaced 2 alert divs with `SectionCard` (Information); form wrapper and inner sections (Expéditeur, Destinataire, Agence de destination, Colis, Total à payer, Envoi créé) with `SectionCard`. |
| `src/modules/agence/courrier/pages/CourierBatchesPage.tsx` | Replaced "Nouveau lot" section and 4 status sections with `SectionCard`; batch detail section and confirmation modal with `SectionCard`; summary panel simplified (no rounded-xl card). |
| `src/modules/agence/courrier/pages/CourierReceptionPage.tsx` | Replaced 2 sections with `SectionCard`; empty state with `EmptyState`. |
| `src/modules/agence/courrier/pages/CourierReportsPage.tsx` | Replaced each session block with `SectionCard`; 4 KPI divs per session with `MetricCard`; empty state with `SectionCard` + `EmptyState`. |
| `src/modules/agence/courrier/pages/CourierSessionPage.tsx` | Replaced "Session" and "Envois de la session" sections with `SectionCard`; close-session modal with `SectionCard`; empty shipments with `EmptyState`. |

**Total: 7 files modified.**  
`CourierDashboardPage.tsx` is a redirect only; no UI.  
`CourierLayout.tsx`, `CourierPageHeader.tsx`, `AgencySearchSelect.tsx`, `CourierReceipt.tsx`, `CourierPackageLabel.tsx` unchanged (layout, deprecated header, dropdowns, print ticket/label).

---

## 2) Confirmation: No `rounded-xl border bg-white` Blocks Remain (Page Content)

- **Pages:** All page-level content cards now use `SectionCard` or `MetricCard`. No remaining `rounded-xl border bg-white shadow-sm` (or similar) divs/sections for main content.
- **Exceptions (intentional):**
  - **CourierReceipt.tsx** and **CourierPackageLabel.tsx**: `rounded-xl` / `shadow-xl` kept for **print/ticket** layout (ticket-force-light, courier-package-label). These are not list/section cards.
  - **Dropdowns:** `CourierCreateShipmentPage` and `AgencySearchSelect` use `rounded-lg border bg-white shadow-lg` on **dropdown `<ul>`** elements (form controls). These are not section containers.

---

## 3) Confirmation: Only SectionCard / MetricCard for Containers

- **SectionCard** is used for:
  - All section titles (Session en direct, Recherche, Détails envoi, Créer un envoi, Expéditeur, Destinataire, Agence de destination, Colis, Total à payer, Envoi créé, Nouveau lot, Détail du lot, Brouillon/Prêt/En route/Clôturé, Envois à marquer arrivés, Envois arrivés — Prêt à retirer, Session, Envois de la session, Rapport Session, Confirmer l'action, Fermer la session, Information).
- **MetricCard** is used for:
  - All KPI blocks (CourierSessionLivePanel: 8 cards; CourierReportsPage: 4 per session).
- **EmptyState** is used for:
  - Aucun envoi en statut Arrivé (Reception); Aucune session courrier (Reports); Aucun envoi pour cette session (Session).
- No custom card-style wrappers (e.g. ad-hoc `div` with rounded-xl, border, bg-white, shadow) remain for page structure.

---

## 4) Screenshot-Level Visual Consistency

- **Layout:** All Courier pages already used `StandardLayoutWrapper` and `PageHeader`; unchanged.
- **Cards:** Every content block uses the same `SectionCard` (border, radius, shadow from `@/ui/foundation`) and `MetricCard` for KPIs. Spacing is the default `p-5` body and consistent gap between cards.
- **Vertical rhythm:** Section cards are stacked with `space-y-6` (Reports) or natural flow; no mixed padding (e.g. p-4 vs p-5 vs p-6) for card bodies.
- **Modals:** Confirmation modals (Batches, Session) use `SectionCard` for the dialog content, so they match the same border/radius/shadow as the rest of the app.
- **Result:** The Courier submenu now uses the same layout and card system as other modules (e.g. Compagnie, Agence). No visual distinction from main menu pages beyond content and courier-specific theme (primaryColorVar).

---

## 5) Components Used (Requirements Met)

- **StandardLayoutWrapper** — already used on all Courier pages.
- **PageHeader** — already used on all Courier pages.
- **SectionCard** — used for all section containers.
- **MetricCard** — used for all KPI/metric blocks.
- **StatusBadge** — not required for this pass; BatchStatusBadge remains for batch status (could be switched to StatusBadge in a later pass).
- **ActionButton** — already used where applicable (e.g. Session, CreateShipment).
- **EmptyState** — used for empty lists (Reception, Reports, Session).

---

## 6) Intentional Exclusions

- **CourierReceipt** / **CourierPackageLabel**: Print and ticket layout preserved; no migration to SectionCard to avoid breaking print styles.
- **Dropdown `<ul>` elements**: Left as-is (form control styling).
- **Error banners**: Red alert divs (rounded-lg border border-red-200 bg-red-50) kept; they are alerts, not section cards.
- **Guichet folder**: No courier-specific pages under `src/modules/agence/guichet/`; no changes there.

---

*Validation completed. Courier submenu is aligned with the design system for containers and spacing.*
