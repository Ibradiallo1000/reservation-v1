# PREMIUM POLISH — Phase 2 (Interaction & micro-feedback)

## Objective

Smoother, more modern, more premium interaction quality and subtle motion. Refinement only; no layout or logic changes.

## Files modified in @/ui

### 1. `foundation/transitions.ts` (new)

- **transitions.colors**: `transition-colors duration-200 ease-out` — default for color/background.
- **transitions.shadow**: `transition-shadow duration-200 ease-out` — e.g. card hover.
- **transitions.colorsAndShadow**: combined for controls that change both.
- **transitions.fast**: `duration-150` for small controls.
- All within 150–200 ms, no animation overload.

### 2. `foundation/index.ts`

- Exported `transitions` and `TransitionKey`.

### 3. `cards/SectionCard.tsx`

- **Hover**: `hover:shadow-md` for subtle elevation (no aggressive effect).
- **Transition**: `transitions.shadow` (200 ms) so shadow change is smooth.

### 4. `controls/ActionButton.tsx`

- **Transition**: `transitions.colors` for smooth color change on hover/focus.
- **Focus ring**: `focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900` so the ring is visible and not clipped; no default blue outline (ring uses variant color: primary → theme, secondary/ghost → gray).
- **Hover**: primary `brightness-90` → `brightness-95`, active `brightness-85` → `brightness-90` for a less harsh feedback.
- **Dark mode**: `focus-visible:ring-gray-500` for secondary/ghost in dark theme.

### 5. `feedback/StatusBadge.tsx`

- **Shape**: `radius.full` → `radius.lg` (rounded-xl) for a slightly softer pill.
- **Alignment**: `py-0.5` → `py-1`, added `justify-center`, `leading-none` for consistent vertical alignment and centering.

### 6. `controls/Input.tsx` (new)

- **Border**: `transition-colors` (via `transitions.colors`) for smooth border-color on focus.
- **Focus**: `focus:border-gray-400`, `focus:ring-2 focus:ring-gray-200` (no harsh blue); `focus:shadow-sm` for slight elevation.
- **Radius**: `radius.md` (rounded-lg) for consistency with buttons.
- **Dark**: `dark:focus:border-gray-500`, `dark:focus:ring-gray-700`.

### 7. `controls/index.ts` & `index.ts`

- Exported `Input` and `InputProps`; added `transitions` and `TransitionKey` to foundation re-exports.

## Interaction improvements

| Component    | Change |
|-------------|--------|
| SectionCard | Subtle hover elevation (shadow-sm → shadow-md) with 200 ms transition. |
| ActionButton| Smooth color transition; refined focus ring with offset; softer brightness steps; theme-based ring color. |
| StatusBadge | Softer rounded shape (rounded-xl); better vertical alignment (py-1, leading-none, justify-center). |
| Input       | Smooth border and shadow transition on focus; soft gray focus ring; consistent radius. |
| Global      | Reusable `transitions.*` tokens for future components. |

## Confirmation

- **No behavior altered** — no logic, routing, or layout structure changed. Only CSS classes and new tokens/components added.
- **Existing APIs unchanged** — SectionCard, ActionButton, StatusBadge props and usage unchanged; new Input is additive.

## Accessibility impact

- **Positive**: ActionButton focus ring is more visible (`ring-offset-white` / `ring-offset-gray-900`) and uses theme/variant color instead of browser default blue, which can improve visibility on colored backgrounds.
- **Positive**: Input uses `focus:ring-2` and clear focus border; no removal of focus indication.
- **Neutral**: StatusBadge is presentational; no focus or keyboard behavior.
- **Recommendation**: Keep `focus-visible` (not `focus`) for buttons so keyboard users get the ring and mouse users don’t get a persistent ring after click. Already in place for ActionButton.

## Note on selects

Canonical input styling lives in `@/ui` via the new `Input`. Native `<select>` or custom dropdowns can reuse the same tokens (`radius.md`, `transitions.colors`, similar focus ring) for consistency when they are refactored to use the design system.
