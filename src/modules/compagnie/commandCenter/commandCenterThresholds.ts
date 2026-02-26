/**
 * Seuils configurables pour le Centre Stratégique V2 (Poste de Pilotage).
 * Utilisés pour le statut global (Stable / Attention / Critique) et les alertes.
 */

/** Baisse de CA vs période précédente : au-dessus = CRITIQUE */
export const REVENUE_CRITICAL_DROP_PERCENT = 15;

/** Baisse de CA vs période précédente : entre WARNING et CRITICAL = ATTENTION */
export const REVENUE_WARNING_DROP_PERCENT = 8;

/** Délai au-delà duquel les validations CEO en attente = CRITIQUE (heures) */
export const SESSION_CRITICAL_DELAY_HOURS = 48;

/** Délai au-delà duquel les sessions non validées = ATTENTION (heures) */
export const SESSION_WARNING_DELAY_HOURS = 24;

/** Solde en dessous duquel un compte est considéré critique (unité: devise compagnie) */
export const ACCOUNT_CRITICAL_THRESHOLD = 50000;

/** Solde en dessous duquel un compte est en avertissement (unité: devise compagnie) */
export const ACCOUNT_WARNING_THRESHOLD = 100000;

/** Nombre d'agences "à risque" (baisse > 15 % ou sans revenu) au-delà duquel statut = CRITIQUE */
export const AGENCIES_AT_RISK_CRITICAL_COUNT = 2;
