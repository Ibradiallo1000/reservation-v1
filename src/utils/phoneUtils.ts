/**
 * Phone number normalization for the reservation system.
 * Ensures consistent storage and search (e.g. Mali 8 digits).
 * Structured for future multi-country support via countryCode.
 */

/** Default country: Mali (prefix 223, 8 digits). */
export const DEFAULT_PHONE_COUNTRY = 'ML';

/**
 * Normalizes a phone number for storage and search.
 * - Removes all non-digit characters.
 * - Removes Mali country prefix (223) if present.
 * - Keeps only the last 8 digits (Mali local).
 * - Returns empty string if invalid/empty.
 *
 * @param phone - Raw input (e.g. "76 49 92 22", "+22376499222", "0022376499222")
 * @param countryCode - Optional; for now only Mali (ML) is used; defaults to ML
 * @returns Normalized 8-digit string (e.g. "76499222") or ""
 */
export function normalizePhone(phone: string, _countryCode?: string): string {
  if (!phone || typeof phone !== 'string') return '';

  let normalized = phone.replace(/\D/g, '');

  // Mali: strip country prefix 223
  if (normalized.startsWith('223')) {
    normalized = normalized.slice(3);
  }

  // Keep last 8 digits (Mali local length)
  if (normalized.length > 8) {
    normalized = normalized.slice(-8);
  }

  // Mali: require exactly 8 digits for valid format
  if (normalized.length !== 8) {
    return '';
  }

  return normalized;
}

/**
 * Returns the phone number to display (original if stored, else telephone).
 * Use for UI only.
 */
export function getDisplayPhone(reservation: { telephoneOriginal?: string | null; telephone?: string | null }): string {
  const raw = reservation.telephoneOriginal ?? reservation.telephone ?? '';
  return typeof raw === 'string' ? raw : '';
}
