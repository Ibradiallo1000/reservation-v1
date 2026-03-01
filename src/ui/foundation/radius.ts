/**
 * Teliya Design System — Border radius scale (authoritative).
 */
export const radius = {
  /** 4px — small controls */
  sm: "rounded",
  /** 8px — buttons, inputs */
  md: "rounded-lg",
  /** 12px — cards, panels */
  lg: "rounded-xl",
  /** 16px — modals, large surfaces */
  xl: "rounded-2xl",
  /** Full pill — badges, avatars */
  full: "rounded-full",
} as const;

export type RadiusKey = keyof typeof radius;
