# Teliya Design System — Migration Plan (STEP 3)

This document is the **migration plan for the global refactor** across 120+ files. The new authoritative foundation lives under **`src/ui/`**. Do not refactor pages in STEP 2; use this plan when executing STEP 3.

---

## 1. New design system location

| Path | Purpose |
|------|---------|
| `src/ui/foundation/` | Tokens: spacing, typography, radius, shadows, status |
| `src/ui/layout/` | StandardLayoutWrapper, PageHeader |
| `src/ui/cards/` | SectionCard, MetricCard |
| `src/ui/feedback/` | StatusBadge, EmptyState |
| `src/ui/controls/` | ActionButton |
| `src/ui/index.ts` | Re-exports everything |

**Import from:** `@/ui` or `@/ui/layout`, `@/ui/cards`, `@/ui/feedback`, `@/ui/controls`, `@/ui/foundation`.

---

## 2. Deprecated (do not use for new code)

| Item | Replacement |
|------|-------------|
| `src/app/design-system.ts` (DESIGN, dsCard, dsPage, etc.) | `@/ui/foundation` + `@/ui` layout/cards |
| `MGR` and local SectionCard, KpiCard, StatusBadge, EmptyState in `agence/manager/ui.tsx` | `@/ui` SectionCard, MetricCard, StatusBadge, EmptyState |
| `CourierPageHeader` | `PageHeader` from `@/ui` with `primaryColorVar="var(--courier-primary, #ea580c)"` |
| Ad-hoc `h1` with `text-2xl font-bold` / `text-xl font-semibold` | `<PageHeader title="..." />` or `typography.pageTitle` |
| Raw card divs (rounded-xl border bg-white shadow-sm) | `<SectionCard>` or shared `Card` + foundation tokens |
| Raw status spans (bg-emerald-100, bg-amber-100, etc.) | `<StatusBadge status="success">` etc. |
| Ad-hoc primary buttons (emerald, orange, inline Tailwind) | `<ActionButton variant="primary">` |
| Scattered page wrappers (max-w-7xl mx-auto p-4 md:p-6) | `<StandardLayoutWrapper>` or foundation `pageMaxWidth` + `pagePadding` + `pageVerticalGap` |

---

## 3. Migration order (STEP 3 execution)

### Phase A — Layout and shell (no page logic change)

1. **InternalLayout**  
   - Keep using DESIGN for sidebar/header (or later switch to foundation tokens).  
   - Optionally wrap main content with `StandardLayoutWrapper` so pages that don’t add their own wrapper get consistent spacing.

2. **CompagnieLayout / CompanyAccountantLayout / GarageLayout**  
   - Ensure content area uses `StandardLayoutWrapper` or same tokens (`pageMaxWidth`, `pagePadding`, `pageVerticalGap`).

3. **CourierLayout**  
   - No structural change; child pages will switch to `PageHeader` instead of `CourierPageHeader`.

### Phase B — Page headers (one component)

4. Replace every in-page **h1** (and CourierPageHeader) with:
   ```tsx
   import { PageHeader } from "@/ui";
   <PageHeader title="Titre" subtitle="..." right={<Actions />} icon={Icon} primaryColorVar="var(--teliya-primary)" />
   ```
   - **Courier pages:** `primaryColorVar="var(--courier-primary, #ea580c)"`, keep existing icon.
   - **Agence / Admin / Compagnie:** Use `primaryColorVar="var(--teliya-primary)"` or omit for default text color.

5. **PageHeaderContext (Compagnie):** Keep context if layout must render title; align title style with `typography.pageTitle` and ensure it matches `PageHeader` visually.

### Phase C — Cards

6. Replace **section-style cards** (title bar + body) with:
   ```tsx
   import { SectionCard } from "@/ui";
   <SectionCard title="..." icon={Icon} right={...} noPad={false}>{content}</SectionCard>
   ```

7. Replace **KPI / metric cards** with:
   ```tsx
   import { MetricCard } from "@/ui";
   <MetricCard label="..." value={value} icon={Icon} critical={false} valueColorVar="var(--teliya-primary)" />
   ```

8. Where only a simple container is needed (no title bar), keep using shared `Card` from `@/shared/ui/card` but ensure it uses `radius.lg` and `shadows.sm` from foundation (or leave as-is if already consistent).

### Phase D — Status badges

9. Replace every **status pill** (success/warning/error/pending/etc.) with:
   ```tsx
   import { StatusBadge } from "@/ui";
   <StatusBadge status="success">Payé</StatusBadge>
   ```
   Map existing labels to: `success`, `warning`, `danger`, `info`, `neutral`, `active`, `pending`, `completed`, `cancelled`.

### Phase E — Buttons

10. Replace **primary/secondary/danger** actions with:
    ```tsx
    import { ActionButton } from "@/ui";
    <ActionButton variant="primary">Enregistrer</ActionButton>
    <ActionButton variant="secondary">Annuler</ActionButton>
    <ActionButton variant="danger">Supprimer</ActionButton>
    ```

11. Keep `@/shared/ui/button` if it already uses theme; align its API with ActionButton or leave as alias during migration.

### Phase F — Empty states

12. Replace local **EmptyState** (e.g. AgenceComptabilitePage, BibliothequeImagesPage, manager) with:
    ```tsx
    import { EmptyState } from "@/ui";
    <EmptyState message="Aucune réservation." />
    ```

### Phase G — Tokens and cleanup

13. Replace **hardcoded spacing** (p-4, p-6, gap-4, space-y-6) with foundation tokens where it simplifies (e.g. `pagePadding`, `pageVerticalGap` in wrappers).

14. Replace **ad-hoc typography** (text-2xl font-bold, text-sm text-gray-500) with `typography.pageTitle`, `typography.muted`, etc., especially in new or touched code.

15. **Remove inline styles** for theme colors where possible: use CSS variables in className or pass `valueColorVar` / `primaryColorVar` to components.

---

## 4. File list by module (refactor targets)

Use the audit file list from **docs/DESIGN-SYSTEM-AUDIT.md** (Section 10). Summary:

- **Agence:** Manager (ui, cockpit, finances, reports, operations, team), Dashboard, Guichet, Boarding, Fleet, Comptabilité, Courrier, other pages (~50+ files).
- **Compagnie:** CEO, Finances, Reservations, Agences, Paramètres, Garage, Comptabilité, Admin compagnie (~40+ files).
- **Plateforme / Admin:** Dashboard, Compagnies, Paramètres, Abonnements, Revenus, Agents, Plans, Médias (~25+ files).
- **Auth:** Login, Register, AcceptInvitation (3 files).

Total: **~120–150 files** to touch (some only for PageHeader, some for cards + badges + buttons).

---

## 5. Consistency checks after refactor (STEP 4)

- [ ] Every internal page uses `PageHeader` or a single shared header pattern (e.g. context-rendered title with same typography).
- [ ] Every section-style block uses `SectionCard` (or one other canonical card with title).
- [ ] Every KPI/metric block uses `MetricCard` or shared Card + foundation typography.
- [ ] Every status pill uses `StatusBadge` with semantic `status` prop.
- [ ] Primary/secondary/danger actions use `ActionButton` (or shared Button aligned with theme).
- [ ] Empty states use `EmptyState` from `@/ui`.
- [ ] Page content wrappers use `StandardLayoutWrapper` or same tokens (pageMaxWidth, pagePadding, pageVerticalGap).
- [ ] No raw emerald/amber/red/gray status classes outside `StatusBadge`.
- [ ] No duplicate DESIGN/MGR usage for new UI; deprecated files only referenced where migration is not yet done.

---

*End of migration plan. Execute STEP 3 in phases; run STEP 4 validation after each phase or at the end.*
