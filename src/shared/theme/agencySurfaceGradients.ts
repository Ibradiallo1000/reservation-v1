/**
 * Surfaces agence / compagnie : dégradés primaire + secondaire.
 * — Page : très léger
 * — Barres (header, onglets) : plus marqué
 * — Sidebar : vertical, plus dense (chrome navigation)
 *
 * Les chaînes utilisent var(--teliya-primary) / var(--teliya-secondary) : les définir
 * sur le même nœud ou un ancêtre.
 */

import type { CSSProperties } from "react";

export function agencySurfaceGradientCssVars(dark: boolean): Record<string, string> {
  if (dark) {
    const base = "rgb(3 7 18)";
    const baseMid = "rgb(8 12 16)";
    const baseDeep = "rgb(2 6 10)";
    return {
      "--agency-gradient-header": `linear-gradient(105deg, color-mix(in srgb, var(--teliya-primary) 48%, ${base}) 0%, color-mix(in srgb, var(--teliya-secondary) 36%, ${baseMid}) 42%, ${base} 88%)`,
      "--agency-gradient-subheader": `linear-gradient(180deg, color-mix(in srgb, var(--teliya-secondary) 22%, ${base}) 0%, color-mix(in srgb, var(--teliya-primary) 14%, ${base}) 55%, ${base} 100%)`,
      "--agency-gradient-page": `linear-gradient(180deg, color-mix(in srgb, var(--teliya-primary) 7%, ${base}) 0%, color-mix(in srgb, var(--teliya-secondary) 4%, ${base}) 35%, ${base} 100%)`,
      "--agency-gradient-sidebar": `linear-gradient(180deg, color-mix(in srgb, var(--teliya-primary) 52%, ${baseDeep}) 0%, color-mix(in srgb, var(--teliya-secondary) 38%, ${baseDeep}) 55%, ${baseDeep} 100%)`,
    };
  }
  return {
    "--agency-gradient-header": `linear-gradient(105deg, color-mix(in srgb, var(--teliya-primary) 36%, white) 0%, color-mix(in srgb, var(--teliya-secondary) 26%, #fff7ed) 38%, color-mix(in srgb, var(--teliya-primary) 16%, white) 100%)`,
    "--agency-gradient-subheader": `linear-gradient(180deg, color-mix(in srgb, var(--teliya-primary) 18%, white) 0%, color-mix(in srgb, var(--teliya-secondary) 12%, #fffaf5) 50%, color-mix(in srgb, var(--teliya-primary) 8%, #fafafa) 100%)`,
    "--agency-gradient-page": `linear-gradient(165deg, color-mix(in srgb, var(--teliya-primary) 4.5%, #fafafa) 0%, color-mix(in srgb, var(--teliya-secondary) 3.5%, #f6f6f6) 45%, #f3f4f6 100%)`,
    "--agency-gradient-sidebar": `linear-gradient(180deg, var(--teliya-primary) 0%, color-mix(in srgb, var(--teliya-secondary) 45%, var(--teliya-primary)) 100%)`,
  };
}

/** Variables CSS pour chrome agence (couleurs marque + dégradés). */
export function buildAgencyChromeStyleVars(
  primary: string,
  secondary: string,
  dark: boolean
): CSSProperties {
  return {
    "--teliya-primary": primary,
    "--teliya-secondary": secondary,
    ...agencySurfaceGradientCssVars(dark),
  } as CSSProperties;
}

/** Racine pleine page : vars + fond page (même modèle que InternalLayout). */
export function agencyChromePageRootStyle(
  primary: string,
  secondary: string,
  dark: boolean
): CSSProperties {
  return {
    ...buildAgencyChromeStyleVars(primary, secondary, dark),
    backgroundImage: "var(--agency-gradient-page)",
  };
}
