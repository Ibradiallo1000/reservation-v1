/**
 * Teliya Design System — Typography scale (authoritative).
 * Single source for all text styles across Agence, Comptable, CEO, Guichet, Courrier, Compagnie, Admin.
 * Premium polish: page title prominence, section hierarchy, muted refinements.
 */
export const typography = {
  /** Page title (H1). Use with theme color via className or style. */
  pageTitle: "text-2xl font-bold tracking-tight",
  /** Page title — premium: slightly larger, stronger presence */
  pageTitlePremium: "text-3xl font-bold tracking-tight",
  /** Section / block title (H2) */
  sectionTitle: "text-lg font-semibold text-gray-900 dark:text-gray-100",
  /** Section card title — clear hierarchy below page, slightly lighter for elegance */
  sectionTitleCard: "text-lg font-medium text-gray-900 dark:text-gray-100",
  /** Card / panel title (H3) */
  cardTitle: "text-base font-semibold leading-none tracking-tight text-gray-900 dark:text-gray-100",
  /** Form labels, table headers */
  label: "text-sm font-medium text-gray-700 dark:text-gray-300",
  /** Large numeric/KPI value — dominant in MetricCard */
  valueLarge: "text-2xl font-bold tabular-nums leading-tight",
  /** Medium value */
  valueMedium: "text-lg font-semibold tabular-nums",
  /** Muted secondary text */
  muted: "text-sm text-gray-500 dark:text-gray-400",
  /** Page header subtitle — more muted, refined */
  subtitle: "text-sm text-gray-400 dark:text-gray-500",
  /** Small muted (captions) */
  mutedSm: "text-xs text-gray-500 dark:text-gray-400",
  /** KPI label (uppercase, small) — clearly secondary to value */
  kpiLabel: "text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400",
} as const;

export type TypographyKey = keyof typeof typography;
