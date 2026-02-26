/**
 * Teliya SaaS – Currency Formatting Utility
 *
 * Provides consistent multi-currency formatting across the entire application.
 * Replaces all hardcoded "FCFA" strings with dynamic currency support.
 *
 * Usage:
 *   formatCurrency(35000, "XOF")  → "35 000 FCFA"
 *   formatCurrency(1200, "GHS")   → "1 200 GH₵"
 *   formatCurrency(5000, "NGN")   → "5 000 ₦"
 *   formatCurrency(5000)          → "5 000 FCFA" (default)
 */

/** Map ISO currency code to display symbol */
const CURRENCY_SYMBOLS: Record<string, string> = {
  XOF: "FCFA",
  XAF: "FCFA",
  GHS: "GH₵",
  NGN: "₦",
  GNF: "GNF",
  CVE: "CVE",
  GMD: "GMD",
  MRU: "MRU",
  LRD: "LRD",
  SLE: "SLE",
  EUR: "€",
  USD: "$",
};

const nf = new Intl.NumberFormat("fr-FR");

/**
 * Format a monetary amount with the correct currency symbol.
 *
 * @param amount  - Numeric value to format
 * @param currency - ISO 4217 currency code (defaults to "XOF")
 * @returns Formatted string, e.g. "35 000 FCFA"
 */
export function formatCurrency(amount: number | undefined | null, currency?: string): string {
  const value = Number(amount) || 0;
  const code = (currency || "XOF").toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? code;
  return `${nf.format(value)} ${symbol}`;
}

/**
 * Get the display symbol for a given currency code.
 *
 * @param currency - ISO 4217 code (defaults to "XOF")
 * @returns Display symbol, e.g. "FCFA", "GH₵", "₦"
 */
export function getCurrencySymbol(currency?: string): string {
  const code = (currency || "XOF").toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? code;
}

/**
 * Default currency used when no currency is specified.
 */
export const DEFAULT_CURRENCY = "XOF";
