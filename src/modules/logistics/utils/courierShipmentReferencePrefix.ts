/**
 * Préfixe configurable des références colis (ticket / étiquette) avant synchro Firestore.
 * Stocké sur `companies.courierShipmentReferencePrefix` (ex. "COL", "ENV").
 */

export const DEFAULT_COURIER_SHIPMENT_REFERENCE_PREFIX = "ENV";

export const COURIER_SHIPMENT_REFERENCE_PREFIX_MAX_LEN = 12;

/** Normalise pour affichage / encodage : A-Z0-9, longueur bornée ; chaîne vide → défaut ENV. */
export function normalizeCourierShipmentReferencePrefix(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!s) return DEFAULT_COURIER_SHIPMENT_REFERENCE_PREFIX;
  return s.slice(0, COURIER_SHIPMENT_REFERENCE_PREFIX_MAX_LEN);
}

/** 8 caractères pour suffixe provisoire (chiffres ou alphanum. dérivé de la seed). */
export function provisionalCourierShipmentSuffix8(seed: string | number): string {
  const raw = String(seed);
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (alnum.length >= 8) return alnum.slice(-8);
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) return digits.slice(-8);
  return String(Date.now()).slice(-8);
}

/** Référence provisoire (optimistic / hors ligne) : PREFIX-XXXXXXXX */
export function formatProvisionalCourierShipmentNumber(prefix: unknown, seed: string | number): string {
  const p = normalizeCourierShipmentReferencePrefix(prefix);
  return `${p}-${provisionalCourierShipmentSuffix8(seed)}`;
}
