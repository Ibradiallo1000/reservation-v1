# STEP 4C-2C — Garage / Fleet block — Cards & Badges standardization

## Scope

- `GarageDashboardPage.tsx`
- `GarageDashboardHomePage.tsx`
- `CompanyGlobalFleetPage.tsx`
- `OperationsFlotteLandingPage.tsx`
- `TripCostsPage.tsx`

## Changes

### 1. GarageDashboardHomePage.tsx

- **SectionCard:** "Indicateurs" (KPIs + link), "Alertes (expiration sous 30 jours)", "Dernières mises à jour".
- **StatusBadge:** Replaced `STATUS_BADGE_CLASS` with `statusToVariant()` + `<StatusBadge />` for vehicle status in recent activity; alert rows use `<StatusBadge status={danger|warning}>` for expiry text.
- **Removed:** `STATUS_BADGE_CLASS`; ad-hoc alert row styling (`bg-amber-50 border-amber-200`) → neutral `border border-gray-200 bg-gray-50`.

### 2. GarageDashboardPage.tsx

- **SectionCard:** Empty state → `<SectionCard>`. Table block → `<SectionCard title="Flotte" icon={Truck} noPad>`.
- **StatusBadge:** Operational and technical status columns use `<StatusBadge status={statusToVariant(v.status)}>` instead of `STATUS_BADGE_CLASS` spans.
- **Removed:** `STATUS_BADGE_CLASS`; filter chips use neutral `bg-gray-50 hover:bg-gray-100 border border-gray-200`.
- **Unchanged:** Modal overlays (Add/Edit vehicle, Archive confirm) keep existing dialog styling (not page section containers).

### 3. CompanyGlobalFleetPage.tsx

- **SectionCard:** Main vehicles block → `<SectionCard title="Véhicules (n)" icon={Truck} noPad>`.
- **StatusBadge:** Statut column → `<StatusBadge status={statusToVariant(v.status)}>`; delay indicator (Normal / Retard / Anomalie) → `<StatusBadge status="success|warning|danger">`.
- **Removed:** Custom section card styling; `Circle`-based colored spans for delay.

### 4. OperationsFlotteLandingPage.tsx

- **SectionCard:** "Synthèse opérationnelle" (MetricCard grid), "Accès rapides" (two nav buttons).
- **Removed:** `rounded-xl border-2` on buttons → `rounded-lg border border-gray-200`; indigo/teal icon wrappers → `bg-gray-100` / `text-gray-600`.

### 5. TripCostsPage.tsx

- **SectionCard:** "Créer un coût trajet", "Modifier (même jour uniquement)", "Historique" (each former `<section className="bg-white rounded-xl border p-4 shadow-sm">` → `<SectionCard title="..." icon={...}>`).

## Validation

| Check | Result |
|-------|--------|
| Custom card containers in block | **None** (only SectionCard for sections). |
| Status indicators | **All** use `<StatusBadge />` (vehicle status, delay, alert expiry). |
| `rounded-xl` on section containers | **None.** Remaining `rounded-xl` only in modal dialogs in `GarageDashboardPage.tsx`. |
| MetricCard | Untouched. |
| Business logic / routing | Unchanged. |

## Files modified

5: `GarageDashboardHomePage.tsx`, `GarageDashboardPage.tsx`, `CompanyGlobalFleetPage.tsx`, `OperationsFlotteLandingPage.tsx`, `TripCostsPage.tsx`.
