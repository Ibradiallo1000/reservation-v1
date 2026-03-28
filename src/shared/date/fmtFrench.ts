/**
 * Affichage dates/heures style terrain FR (dd/MM/yyyy, HH:mm).
 */

function toJsDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = value as { toDate?: () => Date; toMillis?: () => number };
  if (typeof t.toDate === "function") {
    const d = t.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof t.toMillis === "function") {
    const d = new Date(t.toMillis());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Ex. 22/03/2026 à 07:34 */
export function formatFrenchDateTime(value: unknown): string {
  const d = toJsDate(value);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} à ${hh}:${min}`;
}

/** Ex. 22/03/2026 */
export function formatFrenchDate(value: unknown): string {
  const d = toJsDate(value);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
