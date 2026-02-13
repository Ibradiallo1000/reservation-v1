// src/utils/security.ts

export function generateAntiFraudCode(
  reservationId: string,
  montant: number,
  date: string,
  referenceCode: string
) {
  const SECRET = "TELIYA_SECURE_KEY_2026";

  const raw = `${reservationId}_${montant}_${date}_${referenceCode}_${SECRET}`;

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }

  const base36 = Math.abs(hash).toString(36).toUpperCase();

  return `AF-${base36.substring(0, 8)}`;
}
