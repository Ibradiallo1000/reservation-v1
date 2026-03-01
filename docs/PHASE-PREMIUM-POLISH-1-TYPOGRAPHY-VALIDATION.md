# PREMIUM POLISH — Phase 1 (Typography & hierarchy)

## Objective

Micro-typography and visual hierarchy refinement for a premium SaaS feel. No structural migration; polish only.

## Files updated in @/ui

### 1. `foundation/typography.ts`

- **pageTitlePremium**: `text-3xl font-bold tracking-tight` — page title with slightly larger visual weight.
- **sectionTitleCard**: `text-lg font-medium text-gray-900 dark:text-gray-100` — section card title, lighter than sectionTitle for clearer hierarchy and elegance.
- **subtitle**: `text-sm text-gray-400 dark:text-gray-500` — more muted than `muted` for page header subtitle.
- **valueLarge**: added `leading-tight` for dominant KPI value line height.
- **Comments**: clarified usage (e.g. "dominant in MetricCard", "clearly secondary to value").

### 2. `layout/PageHeader.tsx`

- **Title**: uses `typography.pageTitlePremium` (was `pageTitle`) — slightly larger, stronger presence.
- **Spacing**: header container `gap-2` → `gap-3`; subtitle `mt-0.5` → `mt-2` for clearer separation below title.
- **Subtitle**: uses `typography.subtitle` (was `typography.muted`) — more muted, refined.
- **Vertical rhythm**: `mb-6` → `mb-8` for more space below the header.

### 3. `cards/SectionCard.tsx`

- **Title**: uses `typography.sectionTitleCard` (was `typography.sectionTitle`) — same size, reduced weight (font-medium) for elegance and clear hierarchy below PageHeader.

### 4. `cards/MetricCard.tsx`

- **Label**: uses `typography.kpiLabel` (was `typography.muted`) — uppercase, small, clearly secondary.
- **Value**: `mt-1` → `mt-3` between label and value; value uses existing `typography.valueLarge` (with leading-tight from foundation) so values feel dominant.
- **Critical message**: uses `typography.mutedSm` plus font-medium and color — no arbitrary `text-xs`; consistent with design tokens.

### 5. `foundation/spacing.ts`

- **pageVerticalGap**: `space-y-6` → `space-y-8` — more consistent vertical rhythm between sections, avoids tight stacking.

## Visual improvements

| Area | Before | After |
|------|--------|--------|
| Page title | text-2xl, mb-6 | text-3xl (pageTitlePremium), mb-8 |
| Subtitle | muted, mt-0.5 | subtitle (lighter gray), mt-2 |
| Section card title | font-semibold | font-medium (sectionTitleCard) |
| Metric label | muted | kpiLabel (uppercase, tracking) |
| Metric value spacing | mt-1 | mt-3 |
| Section vertical gap | space-y-6 | space-y-8 |

## Confirmation

- **No business logic changed** — only CSS classes and typography token usage.
- **No routing changed.**
- **Design system structure unchanged** — same components and props; only tokens and spacing values refined.

## Areas for manual review

1. **Page title size** — `text-3xl` may feel large on very narrow viewports; consider a responsive variant (e.g. `text-2xl sm:text-3xl`) if needed.
2. **MetricCard labels** — switching to `kpiLabel` (uppercase) changes the look of all KPI labels app-wide; confirm that uppercase is desired everywhere.
3. **Pages that override PageHeader margin** — any page using `className` on PageHeader that sets `mb-*` will override the new `mb-8`; no change required unless you want to remove those overrides for consistency.
