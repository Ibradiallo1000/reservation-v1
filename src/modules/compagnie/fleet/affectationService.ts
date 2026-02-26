// Phase 1 — Affectations par agence : companies/{companyId}/agences/{agencyId}/affectations.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { AffectationDoc, AffectationStatus } from "./affectationTypes";
import { AFFECTATION_STATUS, AFFECTATIONS_COLLECTION } from "./affectationTypes";

export function affectationsRef(companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, AFFECTATIONS_COLLECTION);
}

export function affectationRef(companyId: string, agencyId: string, affectationId: string) {
  return doc(db, "companies", companyId, "agences", agencyId, AFFECTATIONS_COLLECTION, affectationId);
}

export async function listAffectationsByAgency(
  companyId: string,
  agencyId: string,
  options?: { status?: AffectationStatus; limitCount?: number }
): Promise<(AffectationDoc & { id: string })[]> {
  const ref = affectationsRef(companyId, agencyId);
  let q = query(ref, limit(options?.limitCount ?? 200));
  if (options?.status) {
    q = query(ref, where("status", "==", options.status), limit(options.limitCount ?? 200));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AffectationDoc & { id: string }));
}

/** List all affectations across all agencies (for "En transit vers moi" and active vehicle IDs). */
export async function listAffectationsByCompany(
  companyId: string
): Promise<(AffectationDoc & { id: string; agencyId: string })[]> {
  const agencesRef = collection(db, "companies", companyId, "agences");
  const agencesSnap = await getDocs(agencesRef);
  const out: (AffectationDoc & { id: string; agencyId: string })[] = [];
  for (const ag of agencesSnap.docs) {
    const ref = affectationsRef(companyId, ag.id);
    const snap = await getDocs(query(ref, limit(300)));
    snap.docs.forEach((d) => {
      out.push({ id: d.id, agencyId: ag.id, ...d.data() } as AffectationDoc & { id: string; agencyId: string });
    });
  }
  return out;
}

export async function getAffectation(
  companyId: string,
  agencyId: string,
  affectationId: string
): Promise<(AffectationDoc & { id: string }) | null> {
  const d = await getDoc(affectationRef(companyId, agencyId, affectationId));
  if (!d.exists()) return null;
  return { id: d.id, ...d.data() } as AffectationDoc & { id: string };
}

/** Find active affectation for a trip (boarding list). Match by agency, departure/arrival cities, date and time. */
export async function getAffectationForBoarding(
  companyId: string,
  agencyId: string,
  departureCity: string,
  arrivalCity: string,
  dateStr: string,
  timeStr: string
): Promise<(AffectationDoc & { id: string }) | null> {
  const list = await listAffectationsByAgency(companyId, agencyId, { limitCount: 200 });
  const depNorm = (departureCity ?? "").trim().toLowerCase();
  const arrNorm = (arrivalCity ?? "").trim().toLowerCase();
  const wantDate = (dateStr ?? "").trim().slice(0, 10);
  const wantTime = (timeStr ?? "").trim().replace(/\D/g, "").slice(0, 4);
  const normTime = (t: string) => {
    const m = t.trim().match(/(\d{1,2})[:\h]*(\d{0,2})/);
    return m ? m[1].padStart(2, "0") + (m[2] || "00").padStart(2, "0") : "";
  };
  for (const a of list) {
    if (a.status !== AFFECTATION_STATUS.AFFECTE && a.status !== AFFECTATION_STATUS.DEPART_CONFIRME) continue;
    const aDep = (a.departureCity ?? "").trim().toLowerCase();
    const aArr = (a.arrivalCity ?? "").trim().toLowerCase();
    if (aDep !== depNorm || aArr !== arrNorm) continue;
    const dt = a.departureTime;
    if (!dt) continue;
    let datePart = "";
    let timePart = "";
    if (typeof dt === "string") {
      datePart = dt.slice(0, 10);
      timePart = normTime(dt.slice(11, 16) || dt);
    } else if (typeof dt === "object" && (dt as any).seconds != null) {
      const d = new Date((dt as any).seconds * 1000);
      datePart = d.toISOString().slice(0, 10);
      timePart = normTime(d.toTimeString().slice(0, 5));
    }
    if (datePart !== wantDate) continue;
    if (wantTime && timePart && timePart !== wantTime) continue;
    return a;
  }
  return null;
}

/** Active = AFFECTE or DEPART_CONFIRME (vehicle still "in use" for this affectation). */
export async function getActiveAffectationByVehicle(
  companyId: string,
  vehicleId: string
): Promise<{ agencyId: string; affectationId: string; data: AffectationDoc & { id: string } } | null> {
  const agencesRef = collection(db, "companies", companyId, "agences");
  const agencesSnap = await getDocs(agencesRef);
  for (const ag of agencesSnap.docs) {
    const agencyId = ag.id;
    const ref = affectationsRef(companyId, agencyId);
    const q = query(
      ref,
      where("vehicleId", "==", vehicleId),
      where("status", "in", [AFFECTATION_STATUS.AFFECTE, AFFECTATION_STATUS.DEPART_CONFIRME]),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { agencyId, affectationId: d.id, data: { id: d.id, ...d.data() } as AffectationDoc & { id: string } };
    }
  }
  return null;
}

export async function createAffectation(
  companyId: string,
  agencyId: string,
  data: AffectationDoc
): Promise<string> {
  const ref = doc(affectationsRef(companyId, agencyId));
  await setDoc(ref, { ...data, assignedAt: data.assignedAt ?? Timestamp.now() });
  return ref.id;
}

export async function updateAffectationStatus(
  companyId: string,
  agencyId: string,
  affectationId: string,
  status: AffectationStatus,
  extra?: { departureConfirmedAt?: Timestamp; arrivalConfirmedAt?: Timestamp }
): Promise<void> {
  const ref = affectationRef(companyId, agencyId, affectationId);
  const payload: Record<string, unknown> = { status, ...extra };
  await updateDoc(ref, payload);
}
