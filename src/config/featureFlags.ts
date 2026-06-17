/**
 * Feature flags — migration progressive flux financier.
 * Activer progressivement : USE_PAYMENTS_AS_SOURCE puis retrait cashTransactions.
 */

export const USE_PAYMENTS_AS_SOURCE = false;
export const ENABLE_RECONCILIATION = true;

/**
 * Phase 1 commercial MVP.
 * Objectif : simplifier uniquement l'interface visible sans supprimer routes,
 * pages, collections Firestore ni logique métier existante.
 */
export const ENABLE_PHASE1_ONLY = true;

export const ENABLE_COURIER = true;
export const ENABLE_FLEET = false;
export const ENABLE_ADVANCED_FINANCE = false;
export const ENABLE_LOGISTICS = false;
