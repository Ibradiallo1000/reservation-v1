// src/modules/agence/boarding/utils.ts
// Shared utils for boarding (scan, search, norms).
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const weekdayFR = (d: Date): string =>
  d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

export function extractCode(raw: string): string {
  const t = (raw || "").trim();
  try {
    const u = new URL(t);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p.toLowerCase() === "r");
    if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
    return decodeURIComponent(parts[parts.length - 1] || t);
  } catch {
    return t;
  }
}
export function getScanText(res: unknown): string {
  if (!res) return "";
  if (typeof res === "string") return res;
  const r = res as { getText?: () => string; text?: string };
  if (typeof r.getText === "function") return r.getText();
  if (typeof r.text === "string") return r.text;
  return String(res);
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
export function normCity(v?: string): string {
  const s = stripAccents((v || "").toLowerCase());
  return s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
export function normTime(v?: string): string | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  return m ? m[1].padStart(2, "0") + ":" + m[2] : null;
}
export function normDate(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }
  if (typeof v === "object" && v !== null && "seconds" in v) {
    const d = new Date((v as { seconds: number }).seconds * 1000);
    return toLocalISO(d);
  }
  if (v instanceof Date) return toLocalISO(v);
  return null;
}

export interface FindReservationContext {
  dep?: string;
  arr?: string;
  date?: string;
  heure?: string;
  weeklyTripId?: string | null;
}

export async function findReservationByCode(
  companyId: string,
  agencyId: string | null | undefined,
  code: string,
  context?: FindReservationContext
): Promise<{ resId: string; agencyId: string } | null> {
  const normalize = {
    city: (v?: string) => (v ? normCity(v) : ""),
    date: (v?: unknown) => (v ? normDate(v) : null),
    time: (v?: string) => (v ? normTime(v) : null),
  };
  const ctx = {
    dep: normalize.city(context?.dep),
    arr: normalize.city(context?.arr),
    date: normalize.date(context?.date),
    heure: normalize.time(context?.heure),
    id: context?.weeklyTripId || null,
  };
  const relevance = (d: Record<string, unknown>): number => {
    let s = 0;
    const dDep = normalize.city(d.depart as string);
    const dArr = normalize.city((d.arrivee ?? d.arrival) as string);
    const dDate = normalize.date(d.date);
    const dHeure = normalize.time(d.heure as string);
    if (ctx.id && d.trajetId && d.trajetId === ctx.id) s += 100;
    if (dDep && ctx.dep && dDep === ctx.dep) s += 20;
    if (dArr && ctx.arr && dArr === ctx.arr) s += 20;
    if (dDate && ctx.date && dDate === ctx.date) s += 30;
    if (dHeure && ctx.heure && dHeure === ctx.heure) s += 10;
    return s;
  };
  const bestInSnap = (snap: { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => {
    if (snap.empty) return null;
    let best: (typeof snap.docs)[0] | null = null;
    let bestScore = -1;
    snap.docs.forEach((docSnap) => {
      const sc = relevance(docSnap.data());
      if (sc > bestScore) {
        bestScore = sc;
        best = docSnap;
      }
    });
    return best ?? snap.docs[0];
  };

  if (agencyId) {
    const directRef = doc(db, `companies/${companyId}/agences/${agencyId}/reservations`, code);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) return { resId: directSnap.id, agencyId };
    const q1 = query(
      collection(db, `companies/${companyId}/agences/${agencyId}/reservations`),
      where("referenceCode", "==", code)
    );
    const s1 = await getDocs(q1);
    const best = bestInSnap(s1 as unknown as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> });
    if (best) return { resId: best.id, agencyId };
  }

  const ags = await getDocs(collection(db, `companies/${companyId}/agences`));
  for (const ag of ags.docs) {
    const dref = doc(db, `companies/${companyId}/agences/${ag.id}/reservations`, code);
    const ds = await getDoc(dref);
    if (ds.exists()) return { resId: ds.id, agencyId: ag.id };
  }

  let bestDoc: { id: string; data: () => Record<string, unknown> } | null = null;
  let bestAgency: string | null = null;
  let bestScore = -1;
  for (const ag of ags.docs) {
    const q2 = query(
      collection(db, `companies/${companyId}/agences/${ag.id}/reservations`),
      where("referenceCode", "==", code)
    );
    const s2 = await getDocs(q2);
    if (!s2.empty) {
      const candidate = bestInSnap(s2 as unknown as { empty: boolean; docs: Array<{ id: string; data: () => Record<string, unknown> }> });
      if (candidate) {
        const sc = relevance(candidate.data());
        if (sc > bestScore) {
          bestScore = sc;
          bestDoc = candidate;
          bestAgency = ag.id;
        }
      }
    }
  }
  if (bestDoc && bestAgency) return { resId: bestDoc.id, agencyId: bestAgency };
  return null;
}
