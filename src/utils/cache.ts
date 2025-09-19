export type TTL = number; // ms

export function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expires && Date.now() > parsed.expires) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value as T;
  } catch { return null; }
}

export function setCache<T>(key: string, value: T, ttl: TTL = 5 * 60_000) {
  try {
    localStorage.setItem(key, JSON.stringify({ value, expires: Date.now() + ttl }));
  } catch {}
}
