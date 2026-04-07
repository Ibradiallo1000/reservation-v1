/**
 * Couleurs compagnie (primaire / secondaire) — cartes KPI liquidités (relief 3D) et lignes « Flux récents ».
 */
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { Company } from "@/types/companyTypes";

const DEFAULT_PRIMARY = "#4f46e5";
const DEFAULT_SECONDARY = "#8b5cf6";

function parseHex(input: string): { r: number; g: number; b: number } | null {
  let h = input.trim().replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 || !/^[0-9a-fA-F]+$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${r},${g},${b})`;
}

function mixWithWhite(hex: string, whitePortion: number): string {
  const p = parseHex(hex);
  if (!p) return hex.startsWith("#") ? hex : `#${hex}`;
  const t = Math.min(1, Math.max(0, whitePortion));
  return rgb(
    Math.round(p.r * (1 - t) + 255 * t),
    Math.round(p.g * (1 - t) + 255 * t),
    Math.round(p.b * (1 - t) + 255 * t)
  );
}

/** Vers une teinte type ardoise (lisible en mode sombre). */
function mixTowardSlate(hex: string, amount: number): string {
  const p = parseHex(hex);
  if (!p) return "#0f172a";
  const tr = 15;
  const tg = 23;
  const tb = 42;
  const t = Math.min(1, Math.max(0, amount));
  return rgb(
    Math.round(p.r * (1 - t) + tr * t),
    Math.round(p.g * (1 - t) + tg * t),
    Math.round(p.b * (1 - t) + tb * t)
  );
}

function darkenFactor(hex: string, factor: number): string {
  const p = parseHex(hex);
  if (!p) return "#1e293b";
  const f = Math.min(1, Math.max(0, factor));
  return rgb(Math.round(p.r * f), Math.round(p.g * f), Math.round(p.b * f));
}

function rgbaFromHex(hex: string, a: number): string {
  const p = parseHex(hex);
  if (!p) return `rgba(0,0,0,${a})`;
  return `rgba(${p.r},${p.g},${p.b},${a})`;
}

export function resolveLiquidCompanyColors(company: Company | null | undefined): {
  primary: string;
  secondary: string;
} {
  const p = (company?.couleurPrimaire ?? DEFAULT_PRIMARY).trim() || DEFAULT_PRIMARY;
  const s = (company?.couleurSecondaire ?? DEFAULT_SECONDARY).trim() || DEFAULT_SECONDARY;
  return { primary: p, secondary: s };
}

const valueSize =
  "[&>p]:!text-sm sm:[&>p]:!text-xl md:[&>p]:!text-2xl [&>p]:!font-bold [&>p]:!tracking-tight";

/** Coquille carte (dégradé via style + variables --liq-bar / --liq-glow) — contenu libre (dashboard CEO, etc.). */
export const liquidThemedPanelClassName = cn(
  "!rounded-2xl !border-0 transition-all duration-300 ease-out hover:-translate-y-1 active:translate-y-0 active:duration-100",
  "ring-1 ring-inset ring-white/50 dark:ring-white/10",
  "shadow-[0_5px_0_0_var(--liq-bar),0_12px_24px_-8px_var(--liq-glow)]",
  "hover:shadow-[0_7px_0_0_var(--liq-bar),0_18px_36px_-10px_var(--liq-glow-hover)]",
  "dark:shadow-[0_5px_0_0_var(--liq-bar-dark),0_14px_28px_-6px_rgba(0,0,0,0.55)]",
  "dark:hover:shadow-[0_7px_0_0_var(--liq-bar-dark),0_20px_40px_-8px_rgba(0,0,0,0.6)]"
);

/** MetricCard Finances — coquille + typo ciblée enfants. */
export const liquidityMetricCardBaseClassName = cn(
  liquidThemedPanelClassName,
  "[&>div>div>p]:!text-slate-800/90 dark:[&>div>div>p]:!text-slate-100/95",
  "min-w-0 !p-2.5 sm:!p-5",
  valueSize
);

export const liquidityMetricIconClassName =
  "!bg-[var(--liq-icon-bg)] !text-[var(--liq-icon-fg)] dark:!bg-[var(--liq-icon-bg-dark)] dark:!text-[var(--liq-icon-fg-dark)]";

export type LiquidCardVariant = "total" | "cash" | "bank" | "payment";

function barAndGlow(accent: string): { bar: string; barDark: string; glow: string; glowHover: string } {
  const bar = darkenFactor(accent, 0.52);
  const barDark = darkenFactor(accent, 0.38);
  return {
    bar,
    barDark,
    glow: rgbaFromHex(accent, 0.32),
    glowHover: rgbaFromHex(accent, 0.42),
  };
}

function iconVars(accent: string): CSSProperties {
  return {
    "--liq-icon-bg": rgbaFromHex(accent, 0.14),
    "--liq-icon-fg": darkenFactor(accent, 0.42),
    "--liq-icon-bg-dark": rgbaFromHex(accent, 0.22),
    "--liq-icon-fg-dark": mixWithWhite(accent, 0.72),
  } as CSSProperties;
}

/**
 * Styles racine (fond + variables d’ombre / pastille icône).
 */
export function liquidMetricCardStyle(opts: {
  variant: LiquidCardVariant;
  primary: string;
  secondary: string;
  paymentIndex?: number;
  isDark: boolean;
}): CSSProperties {
  const { primary: p, secondary: s, variant, isDark } = opts;
  const payIdx = opts.paymentIndex ?? 0;
  const accentForPayment = payIdx % 2 === 0 ? p : s;

  let gradient: string;
  let barAccent: string;

  if (isDark) {
    const dp = mixTowardSlate(p, 0.55);
    const ds = mixTowardSlate(s, 0.55);
    switch (variant) {
      case "total":
        gradient = `linear-gradient(145deg, ${dp} 0%, #0f172a 48%, ${ds} 100%)`;
        barAccent = p;
        break;
      case "cash":
        gradient = `linear-gradient(145deg, ${ds} 0%, #0f172a 50%, ${dp} 100%)`;
        barAccent = s;
        break;
      case "bank":
        gradient = `linear-gradient(145deg, #0f172a 0%, ${dp} 45%, ${ds} 100%)`;
        barAccent = darkenFactor(p, 0.65);
        break;
      case "payment":
        gradient =
          payIdx % 2 === 0
            ? `linear-gradient(145deg, ${dp} 0%, #0f172a 55%, ${mixTowardSlate(s, 0.35)} 100%)`
            : `linear-gradient(145deg, ${ds} 0%, #0f172a 55%, ${mixTowardSlate(p, 0.35)} 100%)`;
        barAccent = accentForPayment;
        break;
    }
  } else {
    switch (variant) {
      case "total":
        gradient = `linear-gradient(145deg, ${mixWithWhite(p, 0.76)} 0%, #ffffff 45%, ${mixWithWhite(s, 0.8)} 100%)`;
        barAccent = p;
        break;
      case "cash":
        gradient = `linear-gradient(145deg, ${mixWithWhite(s, 0.74)} 0%, #ffffff 50%, ${mixWithWhite(p, 0.78)} 100%)`;
        barAccent = s;
        break;
      case "bank":
        gradient = `linear-gradient(145deg, #ffffff 0%, ${mixWithWhite(p, 0.88)} 45%, ${mixWithWhite(s, 0.84)} 100%)`;
        barAccent = s;
        break;
      case "payment":
        gradient =
          payIdx % 2 === 0
            ? `linear-gradient(145deg, ${mixWithWhite(p, 0.72)} 0%, #ffffff 52%, ${mixWithWhite(s, 0.82)} 100%)`
            : `linear-gradient(145deg, ${mixWithWhite(s, 0.72)} 0%, #ffffff 52%, ${mixWithWhite(p, 0.82)} 100%)`;
        barAccent = accentForPayment;
        break;
    }
  }

  const { bar, barDark, glow, glowHover } = barAndGlow(barAccent);
  const icon = iconVars(variant === "payment" ? accentForPayment : barAccent);

  return {
    background: gradient,
    "--liq-bar": bar,
    "--liq-bar-dark": barDark,
    "--liq-glow": glow,
    "--liq-glow-hover": glowHover,
    ...icon,
  } as CSSProperties;
}

/** Couleur du montant : contraste sur fond clair / sombre. */
export function liquidMetricValueColor(accent: string, isDark: boolean): string {
  if (isDark) return "rgb(248,250,252)";
  return darkenFactor(accent, 0.32);
}

export function liquidMetricAccentForVariant(
  variant: LiquidCardVariant,
  primary: string,
  secondary: string,
  paymentIndex?: number
): string {
  switch (variant) {
    case "total":
      return primary;
    case "cash":
      return secondary;
    case "bank":
      return secondary;
    case "payment":
      return (paymentIndex ?? 0) % 2 === 0 ? primary : secondary;
  }
}

/** Accent par rang de ligne (alternance primaire / secondaire). */
export function liquidFluxRowAccent(index: number, primary: string, secondary: string): string {
  return index % 2 === 0 ? primary : secondary;
}

/**
 * Fond dégradé + liseré gauche — même famille visuelle que les cartes liquidités, sans ombre 3D (liste).
 */
export function liquidFluxRowStyle(opts: {
  index: number;
  primary: string;
  secondary: string;
  isDark: boolean;
}): CSSProperties {
  const { index: i, primary: p, secondary: s, isDark } = opts;
  let gradient: string;
  if (isDark) {
    const dp = mixTowardSlate(p, 0.5);
    const ds = mixTowardSlate(s, 0.5);
    gradient =
      i % 2 === 0
        ? `linear-gradient(105deg, ${dp} 0%, rgba(15,23,42,0.92) 58%, ${mixTowardSlate(s, 0.28)} 100%)`
        : `linear-gradient(105deg, ${ds} 0%, rgba(15,23,42,0.92) 58%, ${mixTowardSlate(p, 0.28)} 100%)`;
  } else {
    gradient =
      i % 2 === 0
        ? `linear-gradient(105deg, ${mixWithWhite(p, 0.9)} 0%, #ffffff 55%, ${mixWithWhite(s, 0.94)} 100%)`
        : `linear-gradient(105deg, ${mixWithWhite(s, 0.9)} 0%, #ffffff 55%, ${mixWithWhite(p, 0.94)} 100%)`;
  }
  const accent = liquidFluxRowAccent(i, p, s);
  return {
    background: gradient,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: darkenFactor(accent, isDark ? 0.52 : 0.42),
    ["--flux-arrow" as string]: darkenFactor(accent, isDark ? 0.62 : 0.48),
  } as CSSProperties;
}
