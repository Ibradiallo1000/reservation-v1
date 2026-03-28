/** Génération token / id public pour QR suivi (navigateur : Web Crypto). */

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

const PUBLIC_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** ~12 caractères, URL-safe (sans 0/O/1/l). */
export function generateTrackingPublicId(length = 12): string {
  const a = new Uint8Array(length);
  crypto.getRandomValues(a);
  let s = "";
  for (let i = 0; i < length; i++) {
    s += PUBLIC_ID_ALPHABET[a[i]! % PUBLIC_ID_ALPHABET.length];
  }
  return s;
}

/** Secret à mettre dans l’URL ; jamais exposé dans le doc public. */
export function generateTrackingToken(): string {
  return randomHex(24);
}

export async function sha256Hex(plain: string): Promise<string> {
  const enc = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lien public sans secret (QR, affichage guichet) — déverrouillage sur la page /track. */
export function buildPublicTrackWebUrl(origin: string, trackingPublicId: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/track/${encodeURIComponent(trackingPublicId)}`;
}

/** Lien complet avec token (ex. partage de confiance, impression « lien direct »). */
export function buildPublicTrackUrl(origin: string, trackingPublicId: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/track/${encodeURIComponent(trackingPublicId)}?token=${encodeURIComponent(token)}`;
}
