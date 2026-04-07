/**
 * Libellés de période en français pour l’activité réseau (pas d’ISO brut).
 */
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * @param todayYmd — ex. {@link getTodayBamako}
 */
export function formatActivityPeriodLabelFr(
  startYmd: string,
  endYmd: string,
  todayYmd: string
): string {
  if (startYmd === endYmd) {
    if (startYmd === todayYmd) return "Aujourd'hui";
    const d = parseYmdLocal(startYmd);
    return format(d, "d MMMM yyyy", { locale: fr });
  }
  const a = parseYmdLocal(startYmd);
  const b = parseYmdLocal(endYmd);
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameYear) {
    return `du ${format(a, "d MMMM", { locale: fr })} au ${format(b, "d MMMM yyyy", { locale: fr })}`;
  }
  return `du ${format(a, "d MMMM yyyy", { locale: fr })} au ${format(b, "d MMMM yyyy", { locale: fr })}`;
}
