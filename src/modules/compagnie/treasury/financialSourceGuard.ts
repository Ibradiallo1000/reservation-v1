/**
 * Garde-fou développement : une vue ne doit pas présenter des chiffres « argent réel » (ledger)
 * mélangés avec d’autres sources sans séparation explicite.
 */
export function reportMixedFinancialSourceUsage(
  pageName: string,
  usesLedgerRealMoney: boolean,
  usesAlternateMoneySourceInSameSection: boolean
): void {
  if (usesLedgerRealMoney && usesAlternateMoneySourceInSameSection) {
    console.error(
      `[financialSourceGuard] ${pageName} : mélange interdit — section « argent réel » (ledger) + autre source dans la même zone UI.`
    );
  }
}
