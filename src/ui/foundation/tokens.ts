/** Teliya UI tokens. CSS custom properties in `index.css` are the runtime source. */
export const tokens = {
  colors: {
    primary: "var(--color-primary)", primaryHover: "var(--color-primary-hover)", primarySoft: "var(--color-primary-soft)",
    success: "var(--color-success)", warning: "var(--color-warning)", danger: "var(--color-danger)", info: "var(--color-info)",
    surface: "var(--color-surface)", surfaceSecondary: "var(--color-surface-secondary)", text: "var(--color-text)",
    textSecondary: "var(--color-text-secondary)", textMuted: "var(--color-text-muted)", border: "var(--color-border)",
    focus: "var(--color-focus)", overlay: "var(--color-overlay)",
  },
  controlHeight: { sm: "2.25rem", md: "2.75rem", lg: "3rem" },
  contentWidth: { reading: "48rem", standard: "80rem", wide: "96rem" },
  breakpoints: { compact: 320, mobile: 375, tablet: 480, desktop: 1024, large: 1440 },
  zIndex: { base: 0, dropdown: 20, sticky: 30, environment: 45, overlay: 50, toast: 60 },
  duration: { fast: "120ms", normal: "160ms", slow: "200ms" },
} as const;
export type TeliyaTokens = typeof tokens;
