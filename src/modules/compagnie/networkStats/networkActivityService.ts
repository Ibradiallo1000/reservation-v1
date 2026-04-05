/**
 * Activité réseau : billets (réservations payées) + colis (envois payés), par agence et par trajet.
 * Ne confond pas avec le ledger (argent réel).
 */
import {
  getDocs,
  query,
  Timestamp,
  where,
  doc,
  getDoc,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { getReservationsInRange, isPaidReservation } from "@/modules/compagnie/networkStats/networkStatsService";
import { tripInstanceRef } from "@/modules/compagnie/tripInstances/tripInstanceService";

const PAID_SHIPMENT = new Set(["PAID_ORIGIN", "PAID_DESTINATION"]);

export type AgencyActivityRow = {
  agencyId: string;
  ventes: number;
  billets: number;
  colis: number;
  remplissage: number | null;
};

export type RouteActivityRow = {
  trajet: string;
  billets: number;
  colis: number;
  caActivite: number;
};

function shipmentAmount(data: Record<string, unknown>): number {
  return Number(data.transportFee ?? 0) + Number(data.insuranceAmount ?? 0);
}

export async function getNetworkActivityByAgency(
  companyId: string,
  start: Date,
  end: Date,
  agencyMeta: { id: string; nom: string }[]
): Promise<AgencyActivityRow[]> {
  const reservations = await getReservationsInRange(companyId, start, end);

  let shipmentDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  try {
    const shipSnap = await getDocs(
      query(
        shipmentsRef(db, companyId),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end))
      )
    );
    shipmentDocs = shipSnap.docs;
  } catch {
    /* index / permissions */
  }

  const paidRes = reservations.filter((r) => isPaidReservation(r.statut));
  const byAgency = new Map<
    string,
    { ventes: number; billets: number; colis: number }
  >();

  for (const a of agencyMeta) {
    byAgency.set(a.id, { ventes: 0, billets: 0, colis: 0 });
  }

  for (const r of paidRes) {
    const aid = r.agencyId || "";
    const cur = byAgency.get(aid) ?? { ventes: 0, billets: 0, colis: 0 };
    cur.ventes += Number(r.montant) || 0;
    cur.billets += Number(r.seatsGo) || 1;
    byAgency.set(aid, cur);
  }

  for (const d of shipmentDocs) {
    const data = d.data() as Record<string, unknown>;
    const st = String(data.paymentStatus ?? "");
    if (!PAID_SHIPMENT.has(st)) continue;
    const aid = String(data.originAgencyId ?? "");
    const cur = byAgency.get(aid) ?? { ventes: 0, billets: 0, colis: 0 };
    cur.colis += 1;
    cur.ventes += shipmentAmount(data);
    byAgency.set(aid, cur);
  }

  return agencyMeta.map((a) => {
    const row = byAgency.get(a.id) ?? { ventes: 0, billets: 0, colis: 0 };
    return {
      agencyId: a.id,
      ventes: row.ventes,
      billets: row.billets,
      colis: row.colis,
      remplissage: null,
    };
  });
}

export async function getRouteActivityRows(
  companyId: string,
  start: Date,
  end: Date
): Promise<RouteActivityRow[]> {
  const reservations = await getReservationsInRange(companyId, start, end);
  const paidRes = reservations.filter((r) => isPaidReservation(r.statut));

  const byRoute = new Map<string, { billets: number; ca: number }>();
  for (const r of paidRes) {
    const dep = String(r.depart ?? "").trim();
    const arr = String(r.arrivee ?? "").trim();
    const key = dep && arr ? `${dep} → ${arr}` : "Autres";
    const cur = byRoute.get(key) ?? { billets: 0, ca: 0 };
    cur.billets += Number(r.seatsGo) || 1;
    cur.ca += Number(r.montant) || 0;
    byRoute.set(key, cur);
  }

  let shipmentDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  try {
    const shipSnap = await getDocs(
      query(
        shipmentsRef(db, companyId),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end))
      )
    );
    shipmentDocs = shipSnap.docs;
  } catch {
    /* index manquant ou accès refusé : colis par trajet ignorés */
  }

  const routeColis = new Map<string, number>();
  for (const d of shipmentDocs) {
    const data = d.data() as Record<string, unknown>;
    if (!PAID_SHIPMENT.has(String(data.paymentStatus ?? ""))) continue;
    const tid = String(data.tripInstanceId ?? "").trim();
    let label = "Hors trajet bus";
    if (tid) {
      try {
        const snap = await getDoc(tripInstanceRef(companyId, tid));
        if (snap.exists()) {
          const t = snap.data() as Record<string, unknown>;
          const d0 = String(t.departureCity ?? t.departure ?? "").trim();
          const a0 = String(t.arrivalCity ?? t.arrival ?? "").trim();
          if (d0 && a0) label = `${d0} → ${a0}`;
        }
      } catch {
        /* ignore */
      }
    }
    routeColis.set(label, (routeColis.get(label) ?? 0) + 1);
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
