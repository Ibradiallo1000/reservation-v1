/**
 * Teliya Design System — Elevation / shadow scale (authoritative).
 */
export const shadows = {
  /** No shadow */
  none: "shadow-none",
  /** Cards, panels (default) */
  sm: "shadow-sm",
  /** Raised cards, dropdowns */
  md: "shadow-md",
  /** Modals, popovers */
  lg: "shadow-lg",
  /** High elevation */
  xl: "shadow-xl",
} as const;

export type ShadowKey = keyof typeof shadows;
