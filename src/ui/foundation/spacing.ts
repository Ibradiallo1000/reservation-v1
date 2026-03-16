/**
 * Teliya Design System — Spacing scale (authoritative).
 * Use these tokens instead of hardcoded p-4, gap-6, etc.
 * Aligned with Tailwind default scale (4px base).
 */
export const spacing = {
  /** 4px */
  xs: "1",
  /** 8px */
  sm: "2",
  /** 12px */
  md: "3",
  /** 16px */
  lg: "4",
  /** 24px */
  xl: "6",
  /** 32px */
  "2xl": "8",
} as const;

/** Tailwind class map for padding/margin: use with p-{value}, m-{value}, gap-{value} */
export const spacingClasses = {
  /** p-1, m-1, gap-1 */
  xs: "1",
  /** p-2, m-2, gap-2 */
  sm: "2",
  /** p-3, m-3, gap-3 */
  md: "3",
  /** p-4, m-4, gap-4 */
  lg: "4",
  /** p-6, m-6, gap-6 */
  xl: "6",
  /** p-8, m-8, gap-8 */
  "2xl": "8",
} as const;

/** Page-level: horizontal padding (responsive) */
export const pagePaddingX = "px-4 md:px-6";
/** Page-level: vertical padding — réduit pour rapprocher contenu du header (16px) */
export const pagePaddingY = "py-4";
/** Page-level: all padding */
export const pagePadding = "px-4 md:px-6 py-4";
/** Vertical rhythm between sections — 16px entre header, titre et cartes */
export const pageVerticalGap = "space-y-4";
/** Content max width + centering */
export const pageMaxWidth = "max-w-7xl mx-auto";
