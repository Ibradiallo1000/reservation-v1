/**
 * Agrégation UI — paiements en ligne par moyen (réservations `preuveVia`), sans service dédié.
 */

export function normalizePaymentMethodLabel(name: string): string {
  const t = String(name ?? "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
  if (!t) return "Inconnu";
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export type ReservationLike = Record<string, unknown>;

/** Filtre métier : billetterie en ligne, paiement effectivement reçu. */
export function isPaidOnlineReservation(data: ReservationLike): boolean {
  const ch = String(data.paymentChannel ?? data.canal ?? "").trim().toLowerCase();
  const ps = String(data.paymentStatus ?? "").trim().toLowerCase();
  return ch === "online" && ps === "paid";
}

function reservationAmount(data: ReservationLike): number {
  const n = Number(data.montant ?? data.amount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function preuveViaKey(data: ReservationLike): string {
  const raw = String(data.preuveVia ?? "").trim();
  if (!raw) return "Inconnu";
  return normalizePaymentMethodLabel(raw);
}

export type AggregateOnlinePaidResult = {
  /** Clé affichée (normalisée) → montant cumulé */
  paymentTotals: Map<string, number>;
  /** Somme des montants des réservations incluses (contrôle) */
  reservationsAmountSum: number;
  /** Nombre de réservations incluses */
  includedCount: number;
};

/**
 * Agrège les montants par `preuveVia` normalisé pour les réservations en ligne payées.
 */
export function aggregateOnlinePaidByPreuveVia(reservations: ReservationLike[]): AggregateOnlinePaidResult {
  const paymentTotals = new Map<string, number>();
  let reservationsAmountSum = 0;
  let includedCount = 0;

  for (const r of reservations) {
    if (!isPaidOnlineReservation(r)) continue;
    const amt = reservationAmount(r);
    reservationsAmountSum += amt;
    includedCount += 1;
    const key = preuveViaKey(r);
    paymentTotals.set(key, (paymentTotals.get(key) ?? 0) + amt);
  }

  const mapSum = [...paymentTotals.values()].reduce((a, b) => a + b, 0);
  if (Math.abs(mapSum - reservationsAmountSum) > 0.01) {
    console.error("[Finances] Agrégation preuveVia : incohérence somme map vs réservations", {
      mapSum,
      reservationsAmountSum,
    });
  }

  return { paymentTotals, reservationsAmountSum, includedCount };
}

/**
 * Fusionne les clés affichées : moyens ayant un volume + méthodes configurées + clés `company.paymentMethods`.
 */
export function mergePaymentMethodDisplayKeys(params: {
  paymentTotals: Map<string, number>;
  configuredMethodNames: string[];
  companyPaymentMethodFieldKeys: string[];
}): string[] {
  const set = new Set<string>();
  params.paymentTotals.forEach((_, k) => set.add(k));
  for (const name of params.configuredMethodNames) {
    const n = String(name ?? "").trim();
    if (n) set.add(normalizePaymentMethodLabel(n));
  }
  for (const fieldKey of params.companyPaymentMethodFieldKeys) {
    const k = String(fieldKey ?? "").trim();
    if (!k) continue;
    set.add(normalizePaymentMethodLabel(k));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}
