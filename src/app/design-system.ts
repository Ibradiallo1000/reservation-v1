// src/app/design-system.ts
// Central design tokens for ALL internal back-office spaces (Teliya global design system).
// No business logic — visual tokens only.

export const DESIGN = {
  // ─── Border Radius ───
  radius: "0.5rem",       // 8px — buttons, inputs, badges
  cardRadius: "0.75rem",  // 12px — cards, panels (rounded-xl)
  pillRadius: "9999px",   // full — pill badges, avatar

  // ─── Card ───
  cardShadow: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)", // shadow-sm
  cardBorder: "1px solid hsl(214.3 31.8% 91.4%)", // border color from CSS vars

  // ─── Page Layout ───
  pagePadding: "p-4 md:p-6",
  pageWidth: "max-w-7xl mx-auto",
  verticalSpacing: "space-y-6",

  // ─── Typography (Teliya global) ───
  typography: {
    /** Page title: bold, large. Color = couleurPrimaire (use style or .teliya-section-title) */
    h1: "text-2xl font-bold",
    /** Section titles: text-couleurPrimaire, font-bold, text-2xl */
    sectionTitle: "text-2xl font-bold",
    /** KPI labels: text-couleurSecondaire, uppercase, text-xs, font-medium */
    kpiLabel: "text-xs font-medium uppercase",
    /** Monetary values: NEVER primary/secondary. Light: text-black, Dark: text-white → use .teliya-monetary */
    kpiValue: "text-2xl font-bold",
    h2: "text-lg font-semibold text-gray-900",
    h3: "text-base font-semibold text-gray-800",
    label: "text-sm font-medium text-gray-700",
    muted: "text-sm text-gray-500",
  },

  // ─── Buttons ───
  button: {
    height: "h-10",
    heightSm: "h-8",
    heightLg: "h-12",
    radius: "rounded-lg",
    fontWeight: "font-medium",
    fontSize: "text-sm",
    transition: "transition-colors duration-200",
    focusRing: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    /** Primary: bg-couleurPrimaire text-white hover:bg-couleurSecondaire */
    primary: "rounded-lg transition-colors duration-200 min-h-[44px]",
    /** Secondary: border border-couleurPrimaire text-couleurPrimaire hover:bg-couleurPrimaire hover:text-white */
    secondary: "rounded-lg border transition-colors duration-200 min-h-[44px]",
  },

  // ─── Layout (sidebar / header) ───
  layout: {
    sidebarWidth: "w-64",
    sidebarWidthCollapsed: "w-20",
    headerHeight: "h-14",
    contentBg: "bg-gray-50",
  },

  // ─── Z-Index Hierarchy ───
  zIndex: {
    header: "z-30",
    sidebar: "z-40",
    modal: "z-50",
  },

  // ─── Default Platform Theme ───
  defaultTheme: {
    primary: "#FF6600",
    secondary: "#FFFFFF",
    primaryHover: "#E55C00",
    primaryForeground: "#FFFFFF",
  },
} as const;

/** Cards: Light = bg-white border-gray-200 rounded-xl shadow-sm; Dark = bg-neutral-900 border-neutral-700 */
export const dsCard =
  "rounded-xl border border-gray-200 bg-white shadow-sm" as const;

export const dsPage =
  `${DESIGN.pageWidth} ${DESIGN.pagePadding} ${DESIGN.verticalSpacing}` as const;

/** Section title: bold, 2xl. Apply color via style={{ color: 'var(--teliya-primary)' }} or --courier-primary in courier. */
export const dsSectionTitle = "text-2xl font-bold" as const;

/** KPI label: secondary color, uppercase, text-xs, font-medium. Apply color via var(--teliya-secondary). */
export const dsKpiLabel = "text-xs font-medium uppercase" as const;

/** Monetary value: Light text-black, Dark text-white. NEVER primary/secondary. */
export const dsMonetary = "teliya-monetary font-mono font-bold" as const;
