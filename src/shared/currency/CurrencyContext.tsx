/**
 * CurrencyContext — Global currency resolution for Teliya SaaS.
 *
 * Provides the active company currency to all descendants so that
 * formatCurrency() and getCurrencySymbol() never need a manual second arg.
 *
 * Injection points:
 *   • CompagnieLayout   → company.devise from auth / impersonation
 *   • AgenceShellPage   → company.devise from auth
 *   • RouteResolver     → company.devise from Firestore slug lookup
 *
 * Admin platform pages intentionally do NOT have a CurrencyProvider,
 * so they fall through to DEFAULT_CURRENCY ("XOF").
 */

import React, { createContext, useCallback, useContext, useMemo } from "react";
import {
  formatCurrency,
  getCurrencySymbol,
  DEFAULT_CURRENCY,
} from "@/shared/utils/formatCurrency";
import { useAuth } from "@/contexts/AuthContext";

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface CurrencyContextValue {
  /** ISO 4217 currency code, e.g. "XOF", "GHS", "NGN" */
  currency: string;
  /** Display symbol, e.g. "FCFA", "GH₵", "₦" */
  symbol: string;
}

const CurrencyCtx = createContext<CurrencyContextValue>({
  currency: DEFAULT_CURRENCY,
  symbol: getCurrencySymbol(DEFAULT_CURRENCY),
});

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

interface CurrencyProviderProps {
  /** ISO 4217 code — falls back to DEFAULT_CURRENCY when undefined/null */
  currency?: string | null;
  children: React.ReactNode;
}

export const CurrencyProvider: React.FC<CurrencyProviderProps> = ({
  currency,
  children,
}) => {
  const code = currency || DEFAULT_CURRENCY;
  const value = useMemo<CurrencyContextValue>(
    () => ({ currency: code, symbol: getCurrencySymbol(code) }),
    [code],
  );
  return <CurrencyCtx.Provider value={value}>{children}</CurrencyCtx.Provider>;
};

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/** Raw access to the currency code + symbol. */
export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyCtx);
}

/** Returns the display symbol (e.g. "FCFA"). */
export function useCurrencySymbol(): string {
  return useContext(CurrencyCtx).symbol;
}

/**
 * Returns a pre-bound formatting function:
 *
 *   const money = useFormatCurrency();
 *   money(35000)  // → "35 000 FCFA" (or whatever the active currency is)
 */
export function useFormatCurrency(): (amount: number | undefined | null) => string {
  const { currency } = useContext(CurrencyCtx);
  return useCallback(
    (amount: number | undefined | null) => formatCurrency(amount, currency),
    [currency],
  );
}

/* ------------------------------------------------------------------ */
/*  Auth-aware provider (standalone pages outside main shells)         */
/* ------------------------------------------------------------------ */

/**
 * Reads `company.devise` from the authenticated user's company via
 * AuthContext and provides it as CurrencyProvider.
 *
 * Use in pages rendered outside CompagnieLayout / AgenceShellPage
 * (e.g. standalone guichet, receipt, comptabilité pages).
 */
export const AuthCurrencyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { company } = useAuth() as any;
  return (
    <CurrencyProvider currency={company?.devise}>
      {children}
    </CurrencyProvider>
  );
};
