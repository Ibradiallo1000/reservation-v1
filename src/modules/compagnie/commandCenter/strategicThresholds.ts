/**
 * TELIYA V2 – Centre Stratégique (Poste de Pilotage).
 * Seuils pour le statut global (Stable / Attention / Critique) et les alertes.
 */

/** Baisse de CA vs période précédente (%) : au-dessus = CRITIQUE */
export const REVENUE_CRITICAL_DROP = 15;

/** Baisse de CA vs période précédente (%) : entre WARNING et CRITICAL = ATTENTION */
export const REVENUE_WARNING_DROP = 8;

/** Délai (heures) au-delà duquel les validations CEO en attente = CRITIQUE */
export const SESSION_CRITICAL_DELAY = 48;

/** Délai (heures) au-delà duquel les sessions non validées = ATTENTION */
export const SESSION_WARNING_DELAY = 24;

/** Solde en dessous duquel un compte trésorerie est critique (unité : devise compagnie) */
export const ACCOUNT_CRITICAL_THRESHOLD = 50000;

/** Solde en dessous duquel un compte trésorerie est en avertissement (unité : devise compagnie) */
export const ACCOUNT_WARNING_THRESHOLD = 100000;

/** Nombre d'agences à risque (baisse > 15 % ou sans revenu) au-delà duquel statut = CRITIQUE */
export const AGENCIES_AT_RISK_CRITICAL_COUNT = 2;
