/** Événement document pour rafraîchir caisse / trésorerie côté UI sans recharger la page. */
export const AGENCY_CASH_UI_REFRESH_EVENT = "agency-cash-refresh";

export function dispatchAgencyCashUiRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AGENCY_CASH_UI_REFRESH_EVENT));
}
