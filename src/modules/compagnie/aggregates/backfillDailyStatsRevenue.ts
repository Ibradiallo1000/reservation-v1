/**
 * Backfill dailyStats with ticketRevenue, courierRevenue, totalRevenue
 * from reservations and shipments (paid only).
 * Run per company (e.g. from admin or Cloud Function).
 */
import { collection, doc, getDocs, query, where, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";

const DAILY_STATS_COLLECTION = "dailyStats";

function dailyStatsDocPath(companyId: string, agencyId: string, date: string): string {
  return `companies/${companyId}/agences/${agencyId}/${DAILY_STATS_COLLECTION}/${date}`;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateKeyFromTimestamp(ts: unknown): string | null {
  if (!ts) return null;
  if (typeof (ts as { toDate?: () => Date }).toDate === "function") {
    return toDateKey((ts as { toDate: () => Date }).toDate());
  }
  if (ts instanceof Date) return toDateKey(ts);
  try {
    return toDateKey(new Date(ts as string | number));
  } catch {
    return null;
  }
}

const PAID_PAYMENT_STATUSES = ["PAID_ORIGIN", "PAID_DESTINATION"];

export type BackfillOptions = {
  startDate?: Date;
  endDate?: Date;
  /** Max agencies to process (default all) */
  limitAgencies?: number;
};

export type BackfillResult = {
  companyId: string;
  agenciesProcessed: number;
  docsWritten: number;
  errors: string[];
};

/**
 * Recomputes ticketRevenue and courierRevenue from reservations and shipments
 * and writes dailyStats documents (merge). Use for historical correction.
 */
export async function backfillDailyStatsForCompany(
  companyId: string,
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const errors: string[] = [];
  let docsWritten = 0;

  const agenciesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
  const agencies = agenciesSnap.docs.map((d) => ({ id: d.id }));
  const toProcess = options.limitAgencies ? agencies.slice(0, options.limitAgencies) : agencies;

  for (const agency of toProcess) {
    const agencyId = agency.id;

    // Ticket revenue by date (reservations.montant, any status with montant)
    const reservationsRef = collection(db, "companies", companyId, "agences", agencyId, "reservations");
    let resQuery = query(reservationsRef);
    if (options.startDate || options.endDate) {
      const constraints = [];
      if (options.startDate) {
        constraints.push(where("date", ">=", toDateKey(options.startDate)));
      }
      if (options.endDate) {
        constraints.push(where("date", "<=", toDateKey(options.endDate)));
      }
      if (constraints.length) resQuery = query(reservationsRef, ...constraints);
    }
    const resSnap = await getDocs(resQuery).catch((e) => {
      errors.push(`reservations ${agencyId}: ${(e as Error).message}`);
      return null;
    });
    const ticketByDate: Record<string, number> = {};
    if (resSnap) {
      resSnap.docs.forEach((d) => {
        const data = d.data();
        const dateStr = (data.date as string) || toDateKeyFromTimestamp(data.createdAt);
        if (!dateStr) return;
        const montant = Number(data.montant ?? 0);
        if (montant > 0) {
          ticketByDate[dateStr] = (ticketByDate[dateStr] ?? 0) + montant;
        }
      });
    }

    // Courier revenue by date (paid shipments only)
    const shipCol = shipmentsRef(db, companyId);
    let shipQuery = query(shipCol, where("originAgencyId", "==", agencyId));
    if (options.startDate || options.endDate) {
      const tsStart = options.startDate ? Timestamp.fromDate(options.startDate) : null;
      const tsEnd = options.endDate ? Timestamp.fromDate(options.endDate) : null;
      const constraints: ReturnType<typeof where>[] = [where("originAgencyId", "==", agencyId)];
      if (tsStart) constraints.push(where("createdAt", ">=", tsStart));
      if (tsEnd) constraints.push(where("createdAt", "<=", tsEnd));
      shipQuery = query(shipCol, ...constraints);
    }
    const shipSnap = await getDocs(shipQuery).catch((e) => {
      errors.push(`shipments ${agencyId}: ${(e as Error).message}`);
      return null;
    });
    const courierByDate: Record<string, number> = {};
    if (shipSnap) {
      shipSnap.docs.forEach((d) => {
        const data = d.data();
        const status = data.paymentStatus as string | undefined;
        if (!PAID_PAYMENT_STATUSES.includes(status ?? "")) return;
        const dateStr = toDateKeyFromTimestamp(data.createdAt);
        if (!dateStr) return;
        const amount = Number(data.transportFee ?? 0) + Number(data.insuranceAmount ?? 0);
        if (amount > 0) {
          courierByDate[dateStr] = (courierByDate[dateStr] ?? 0) + amount;
        }
      });
    }

    const allDates = new Set<string>([...Object.keys(ticketByDate), ...Object.keys(courierByDate)]);
    for (const dateStr of allDates) {
      const ticketRevenue = ticketByDate[dateStr] ?? 0;
      const courierRevenue = courierByDate[dateStr] ?? 0;
      const totalRevenue = ticketRevenue + courierRevenue;
      const ref = doc(db, dailyStatsDocPath(companyId, agencyId, dateStr));
      await setDoc(
        ref,
        {
          companyId,
          agencyId,
          date: dateStr,
          ticketRevenue,
          courierRevenue,
          totalRevenue,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((e) => errors.push(`dailyStats ${agencyId}/${dateStr}: ${(e as Error).message}`));
      docsWritten += 1;
    }
  }

  return {
    companyId,
    agenciesProcessed: toProcess.length,
    docsWritten,
    errors,
  };
}
