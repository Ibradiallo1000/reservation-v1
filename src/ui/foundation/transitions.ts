/**
 * Teliya Design System — Transition tokens (authoritative).
 * Use for consistent, subtle motion (150–200ms). No animation overload.
 */
export const transitions = {
  /** Default for color/background changes (200ms) */
  colors: "transition-colors duration-200 ease-out",
  /** Shadow changes (e.g. card hover) */
  shadow: "transition-shadow duration-200 ease-out",
  /** Combined for controls that change both */
  colorsAndShadow: "transition-colors transition-shadow duration-200 ease-out",
  /** Slightly snappier (150ms) for small controls */
  fast: "transition-colors duration-150 ease-out",
} as const;

export type TransitionKey = keyof typeof transitions;
