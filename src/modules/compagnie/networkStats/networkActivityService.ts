/**
 * Activité réseau : agrégations depuis `activityLogs` uniquement (hors ledger).
 */
import type { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase/firestore";
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import { parseCommercialActivityLog } from "@/modules/compagnie/networkStats/activityCore";

export type AgencyActivityRow = {
  agencyId: string;
  ventes: number;
  billets: number;
  /** Places billetterie guichet (`type` ticket, `source` guichet). */
  placesGuichet: number;
  /** Places billetterie en ligne (`type` online, `source` online). */
  placesOnline: number;
  colis: number;
};

export type RouteActivityRow = {
  trajet: string;
  billets: number;
  colis: number;
  caActivite: number;
};

function logCreatedAt(data: Record<string, unknown>): Date {
  const c = data.createdAt as Timestamp | undefined;
  return c?.toDate?.() ?? new Date(0);
}

function emptyAgencyTotals() {
  return { ventes: 0, billets: 0, colis: 0, placesGuichet: 0, placesOnline: 0 };
}

/** Agrège par agence à partir de documents `activityLogs` déjà chargés (une seule lecture Firestore). */
export function aggregateNetworkActivityByAgencyFromDocs(
  docs: QueryDocumentSnapshot<DocumentData>[],
  agencyMeta: { id: string; nom: string }[]
): AgencyActivityRow[] {
  const byAgency = new Map<string, ReturnType<typeof emptyAgencyTotals>>();

  for (const a of agencyMeta) {
    byAgency.set(a.id, emptyAgencyTotals());
  }

  for (const d of docs) {
    const parsed = parseCommercialActivityLog(d.data() as Record<string, unknown>);
    if (!parsed) continue;
    const aid = parsed.agencyId;
    const cur = byAgency.get(aid) ?? emptyAgencyTotals();
    if (parsed.kind === "courier") {
      cur.colis += 1;
      cur.ventes += parsed.amount;
    } else if (parsed.kind === "guichet_ticket") {
      cur.billets += parsed.seats;
      cur.placesGuichet += parsed.seats;
      cur.ventes += parsed.amount;
    } else {
      cur.billets += parsed.seats;
      cur.placesOnline += parsed.seats;
      cur.ventes += parsed.amount;
    }
    byAgency.set(aid, cur);
  }

  return agencyMeta.map((a) => {
    const row = byAgency.get(a.id) ?? emptyAgencyTotals();
    return {
      agencyId: a.id,
      ventes: row.ventes,
      billets: row.billets,
      placesGuichet: row.placesGuichet,
      placesOnline: row.placesOnline,
      colis: row.colis,
    };
  });
}

export async function getNetworkActivityByAgency(
  companyId: string,
  start: Date,
  end: Date,
  agencyMeta: { id: string; nom: string }[]
): Promise<AgencyActivityRow[]> {
  const docs = await queryActivityLogsInRange(companyId, start, end);
  return aggregateNetworkActivityByAgencyFromDocs(docs, agencyMeta);
}

export function aggregateRouteActivityRowsFromDocs(docs: QueryDocumentSnapshot<DocumentData>[]): RouteActivityRow[] {
  const byRoute = new Map<string, { billets: number; ca: number }>();
  const routeColis = new Map<string, number>();

  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    const parsed = parseCommercialActivityLog(data);
    if (!parsed) continue;
    void logCreatedAt(data);
    const dep = String(data.depart ?? "").trim();
    const arr = String(data.arrivee ?? "").trim();
    const key = dep && arr ? `${dep} → ${arr}` : "Autres";

    if (parsed.kind === "courier") {
      routeColis.set(key, (routeColis.get(key) ?? 0) + 1);
      const cur = byRoute.get(key) ?? { billets: 0, ca: 0 };
      cur.ca += parsed.amount;
      byRoute.set(key, cur);
    } else {
      const cur = byRoute.get(key) ?? { billets: 0, ca: 0 };
      cur.billets += parsed.seats;
      cur.ca += parsed.amount;
      byRoute.set(key, cur);
    }
  }

  const keys = new Set([...byRoute.keys(), ...routeColis.keys()]);
  const rows: RouteActivityRow[] = [];
  for (const trajet of keys) {
    const r = byRoute.get(trajet) ?? { billets: 0, ca: 0 };
    rows.push({
      trajet,
      billets: r.billets,
      colis: routeColis.get(trajet) ?? 0,
      caActivite: r.ca,
    });
  }
  rows.sort((a, b) => b.caActivite - a.caActivite);
  return rows;
}

export async function getRouteActivityRows(
  companyId: string,
  start: Date,
  end: Date
): Promise<RouteActivityRow[]> {
  const docs = await queryActivityLogsInRange(companyId, start, end);
  return aggregateRouteActivityRowsFromDocs(docs);
}
