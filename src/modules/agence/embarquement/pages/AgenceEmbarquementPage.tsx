// src/pages/AgenceEmbarquementPage.tsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
  updateDoc,
  arrayUnion,
  limit as fsLimit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { createFleetMovementPayload, buildVehicleTransitionToInTransit } from "@/modules/agence/fleet/fleetStateMachine";
import { canTransition } from "@/modules/agence/fleet/types";
import {
  boardingStatsKey,
  getBoardingStatsRef,
  createBoardingStats,
  incrementBoardingStatsEmbarked,
  setBoardingStatsClosed,
} from "@/modules/agence/aggregates/boardingStats";
import { updateDailyStatsOnBoardingClosed } from "@/modules/agence/aggregates/dailyStats";
import {
  updateAgencyLiveStateOnBoardingOpened,
  updateAgencyLiveStateOnBoardingClosed,
  updateAgencyLiveStateOnVehicleInTransit,
} from "@/modules/agence/aggregates/agencyLiveState";
import { getAffectationForBoarding } from "@/modules/compagnie/fleet/affectationService";
import { getEffectiveStatut, canEmbarkWithScan, RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { buildStatutTransitionPayload } from "@/modules/agence/services/reservationStatutService";

/* ===================== Types ===================== */
type StatutEmbarquement = "embarqué" | "absent" | "en_attente";

interface Reservation {
  id: string;
  nomClient?: string;
  telephone?: string;
  depart?: string;
  arrivee?: string;
  date?: any;
  heure?: string;
  canal?: string;
  montant?: number;
  statut?: string;
  statutEmbarquement?: StatutEmbarquement;
  checkInTime?: any;
  trajetId?: string;
  referenceCode?: string;
  controleurId?: string;
  arrival?: string;
  seatsGo?: number;
}

interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  horaires: { [jour: string]: string[] };
  active: boolean;
}

type SelectedTrip = {
  id?: string;
  departure: string;
  arrival: string;
  heure: string;
};

type AgencyItem = { id: string; nom: string };

/* ===================== Utils ===================== */
function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const weekdayFR = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

function extractCode(raw: string): string {
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
function getScanText(res: any): string {
  if (!res) return "";
  if (typeof res === "string") return res;
  if (typeof (res as any).getText === "function") return (res as any).getText();
  if (typeof (res as any).text === "string") return (res as any).text;
  return String(res);
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normCity(v?: string): string {
  const s = stripAccents((v || "").toLowerCase());
  const s2 = s.replace(/[^a-z0-9]+/g, " ");
  return s2.replace(/\s+/g, " ").trim();
}
function normTime(v?: string): string | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return m[1].padStart(2, "0") + ":" + m[2];
}
function normDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }
  if (typeof v === "object" && "seconds" in v) {
    const d = new Date((v as any).seconds * 1000);
    return toLocalISO(d);
  }
  if (v instanceof Date) return toLocalISO(v);
  return null;
}

/* ===================== Recherche robuste ===================== */
async function findReservationByCode(
  companyId: string,
  agencyId: string | null | undefined,
  code: string,
  context?: {
    dep?: string; arr?: string; date?: string; heure?: string; weeklyTripId?: string | null;
  }
): Promise<{ resId: string; agencyId: string } | null> {
  const normalize = {
    city: (v?: string) => (v ? stripAccents(v).toLowerCase().trim() : ""),
    date: (v?: any) => (v ? normDate(v) : null),
    time: (v?: string) => (v ? normTime(v) : null),
  };

  const ctx = {
    dep: normalize.city(context?.dep),
    arr: normalize.city(context?.arr),
    date: normalize.date(context?.date),
    heure: normalize.time(context?.heure),
    id: context?.weeklyTripId || null,
  };

  const relevance = (d: any) => {
    let s = 0;
    const dDep = normalize.city(d.depart);
    const dArr = normalize.city(d.arrivee || d.arrival);
    const dDate = normalize.date(d.date);
    const dHeure = normalize.time(d.heure);
    if (ctx.id && d.trajetId && d.trajetId === ctx.id) s += 100;
    if (dDep && ctx.dep && dDep === ctx.dep) s += 20;
    if (dArr && ctx.arr && dArr === ctx.arr) s += 20;
    if (dDate && ctx.date && dDate === ctx.date) s += 30;
    if (dHeure && ctx.heure && dHeure === ctx.heure) s += 10;
    return s;
  };

  const bestInSnap = (snap: any) => {
    if (snap.empty) return null;
    let best: any = null;
    let bestScore = -1;
    snap.docs.forEach((docSnap: any) => {
      const sc = relevance(docSnap.data());
      if (sc > bestScore) { bestScore = sc; best = docSnap; }
    });
    return best || snap.docs[0];
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
    const best = bestInSnap(s1);
    if (best) return { resId: best.id, agencyId };
  }

  const ags = await getDocs(collection(db, `companies/${companyId}/agences`));

  for (const ag of ags.docs) {
    const dref = doc(db, `companies/${companyId}/agences/${ag.id}/reservations`, code);
    const ds = await getDoc(dref);
    if (ds.exists()) return { resId: ds.id, agencyId: ag.id };
  }

  let bestDoc: any = null;
  let bestAgency: string | null = null;
  let bestScore = -1;

  for (const ag of ags.docs) {
    const q2 = query(
      collection(db, `companies/${companyId}/agences/${ag.id}/reservations`),
      where("referenceCode", "==", code)
    );
    const s2 = await getDocs(q2);
    if (!s2.empty) {
      const candidate = bestInSnap(s2);
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

/* ===================== Page ===================== */
interface AgenceEmbarquementPageProps {
  /** Phase 3: when set, boarding is blocked when embarked count exceeds this */
  vehicleCapacity?: number | null;
}
const AgenceEmbarquementPage: React.FC<AgenceEmbarquementPageProps> = ({ vehicleCapacity = null }) => {
  const { user, company } = useAuth() as any;
  const location = useLocation() as {
    state?: { trajet?: string; date?: string; heure?: string; agencyId?: string; tripId?: string; departure?: string; arrival?: string };
  };

  const theme = {
    primary: (company as any)?.couleurPrimaire || "#0ea5e9",
    secondary: (company as any)?.couleurSecondaire || "#f59e0b",
    bg: "#f7f8fa",
  };

  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;
  const uid = user?.uid ?? null;

  const [agencies, setAgencies] = useState<AgencyItem[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(userAgencyId);
  const [agencyInfo, setAgencyInfo] = useState<any | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(
    location.state?.date || toLocalISO(new Date())
  );

  const [trajetsDuJour, setTrajetsDuJour] = useState<WeeklyTrip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<SelectedTrip | null>(null);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Scan caméra
  const [scanOn, setScanOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<number>(0);
  const lastAlertRef = useRef<number>(0);

  // Affectation (optionnelle) — véhicule / chauffeur / convoyeur depuis document affectation Phase 1
  const [assign, setAssign] = useState<{
    bus?: string;
    immat?: string;
    chauffeur?: string;
    chauffeurPhone?: string;
    chef?: string;
    chefPhone?: string;
  }>({});

  /* ---------- Charger les agences ---------- */
  useEffect(() => {
    (async () => {
      if (!companyId) return;
      if (userAgencyId) {
        if (!agencies.length) {
          const snap = await getDocs(collection(db, `companies/${companyId}/agences`));
          const list = snap.docs.map(d => ({ id: d.id, nom: (d.data() as any)?.nom || (d.data() as any)?.name || d.id }));
          setAgencies(list);
        }
        return;
      }
      const snap = await getDocs(collection(db, `companies/${companyId}/agences`));
      const list = snap.docs.map(d => ({ id: d.id, nom: (d.data() as any)?.nom || (d.data() as any)?.name || d.id }));
      setAgencies(list);
      if (list.length === 1) setSelectedAgencyId(list[0].id);
    })();
  }, [companyId, userAgencyId, agencies.length]);

  /* ---------- Charger les infos de l’agence sélectionnée ---------- */
useEffect(() => {
  if (!companyId || !selectedAgencyId) {
    setAgencyInfo(null);
    return;
  }

  const ref = doc(
    db,
    `companies/${companyId}/agences/${selectedAgencyId}`
  );

  getDoc(ref).then((snap) => {
    if (snap.exists()) {
      setAgencyInfo({ id: snap.id, ...(snap.data() as any) });
    }
  });
}, [companyId, selectedAgencyId]);

  /* ---------- Affectation liée au trajet (Phase 1: document affectation par trajet) ---------- */
  useEffect(() => {
    setAssign({});
    if (!companyId || !selectedAgencyId || !selectedTrip || !selectedDate) return;
    const dep = (selectedTrip.departure ?? "").trim();
    const arr = (selectedTrip.arrival ?? "").trim();
    const heure = (selectedTrip.heure ?? "").trim();
    if (!dep || !arr) return;
    getAffectationForBoarding(companyId, selectedAgencyId, dep, arr, selectedDate, heure)
      .then((a) => {
        if (a) {
          setAssign({
            bus: (a as any).vehicleModel ?? "",
            immat: (a as any).vehiclePlate ?? "",
            chauffeur: (a as any).driverName ?? "",
            chauffeurPhone: (a as any).driverPhone ?? "",
            chef: (a as any).convoyeurName ?? "",
            chefPhone: (a as any).convoyeurPhone ?? "",
          });
        }
      })
      .catch(() => {});
  }, [companyId, selectedAgencyId, selectedTrip, selectedDate]);

  /* ---------- Pré-remplissage navigation ---------- */
  useEffect(() => {
    const st = location.state;
    if (st?.agencyId) setSelectedAgencyId(st.agencyId);
    if (!st?.trajet && !st?.departure) return;
    const dep = st?.departure ?? (st?.trajet ? st.trajet.split("→").map((s: string) => s.trim())[0] : "") ?? "";
    const arr = st?.arrival ?? (st?.trajet ? st.trajet.split("→").map((s: string) => s.trim())[1] : "") ?? "";
    const heure = st?.heure ?? "";
    if (!heure) return;
    setSelectedTrip({
      id: st?.tripId,
      departure: dep,
      arrival: arr,
      heure,
    });
    if (st?.date) setSelectedDate(st.date);
  }, [location.state]);

  /* ---------- WeeklyTrips du jour ---------- */
  useEffect(() => {
    const load = async () => {
      if (!companyId || !selectedAgencyId) { setTrajetsDuJour([]); return; }

      const weeklyTripsRef = collection(
        db,
        `companies/${companyId}/agences/${selectedAgencyId}/weeklyTrips`
      );
      const snap = await getDocs(weeklyTripsRef);

      const dayName = weekdayFR(new Date(selectedDate));
      const trips = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as WeeklyTrip)
        .filter((t) => t.active && t.horaires?.[dayName]?.length > 0);

      setTrajetsDuJour(trips);

      if (selectedTrip && !selectedTrip.id) {
        const found = trips.find(
          (t) =>
            t.departure === selectedTrip.departure &&
            t.arrival === selectedTrip.arrival &&
            (t.horaires[dayName] || []).includes(selectedTrip.heure)
        );
        if (found) {
          setSelectedTrip((prev) => (prev ? { ...prev, id: found.id } : prev));
        }
      }
    };
    void load();
  }, [companyId, selectedAgencyId, selectedDate]); // eslint-disable-line

  /* ---------- Écoute temps réel réservations (inclut EMBARQUÉ/ABSENT) ---------- */
  useEffect(() => {
    if (!companyId || !selectedAgencyId) { setReservations([]); return; }
    if (!selectedTrip || !selectedTrip.departure || !selectedTrip.arrival || !selectedTrip.heure) {
      setReservations([]); return;
    }

    setIsLoading(true);
    setReservations([]);

    const base = collection(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations`);
    const unsubs: Array<() => void> = [];
    const bag = new Map<string, Reservation>();

    const commit = () => {
      const list = Array.from(bag.values()).sort((a, b) => {
        const aRep = !!(a.canal === "report" || (a as any).sourceReservationId);
        const bRep = !!(b.canal === "report" || (b as any).sourceReservationId);
        if (aRep !== bRep) return aRep ? -1 : 1; // reports d'abord
        return (a.nomClient || "").localeCompare(b.nomClient || "");
      });
      setReservations(list);
      setIsLoading(false);
    };

    const qAll = query(
      base,
      where("date", "==", selectedDate),
      where("depart", "==", selectedTrip.departure),
      where("arrivee", "==", selectedTrip.arrival),
      where("heure", "==", selectedTrip.heure),
      where("statut", "in", [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"] as any)
    );
    unsubs.push(onSnapshot(qAll, (snap) => {
      snap.docs.forEach((d) => bag.set(d.id, { id: d.id, ...(d.data() as any) }));
      commit();
    }, () => setIsLoading(false)));

    if (selectedTrip.id) {
      const qById = query(
        base,
        where("date", "==", selectedDate),
        where("trajetId", "==", selectedTrip.id),
        where("heure", "==", selectedTrip.heure),
        where("statut", "in", [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"] as any)
      );
      unsubs.push(onSnapshot(qById, (snap) => {
        snap.docs.forEach((d) => bag.set(d.id, { id: d.id, ...(d.data() as any) }));
        commit();
      }, () => setIsLoading(false)));
    }

    return () => unsubs.forEach((u) => u());
  }, [companyId, selectedAgencyId, selectedTrip, selectedDate]);

  /* ---------- Mise à jour Embarqué / Absent (verrou + concordance) ---------- */
  const updateStatut = useCallback(
    async (
      reservationId: string,
      statut: StatutEmbarquement,
      agencyOverride?: string
    ) => {
      if (!companyId || !uid) return;

      const agencyIdToUse = agencyOverride ?? selectedAgencyId;
      if (!agencyIdToUse) {
        alert("Sélectionne d’abord une agence.");
        return;
      }
      if (!selectedTrip || !selectedDate) {
        alert("Sélectionne la date et le trajet avant d’embarquer.");
        return;
      }

      const resRef = doc(
        db,
        `companies/${companyId}/agences/${agencyIdToUse}/reservations/${reservationId}`
      );

      // Phase 3: capacity check before transaction (tx.get() does not support queries)
      if (statut === "embarqué" && vehicleCapacity != null && vehicleCapacity > 0) {
        const qEmb = query(
          collection(db, `companies/${companyId}/agences/${agencyIdToUse}/reservations`),
          where("date", "==", selectedDate),
          where("heure", "==", selectedTrip!.heure),
          where("statutEmbarquement", "==", "embarqué")
        );
        const snapEmb = await getDocs(qEmb);
        let seatsEmbarques = 0;
        snapEmb.docs.forEach((d) => {
          const docData = d.data() as { trajetId?: string; depart?: string; arrivee?: string; arrival?: string; seatsGo?: number };
          if (docData.trajetId === selectedTrip?.id || (normCity(docData.depart) === normCity(selectedTrip!.departure) && normCity(docData.arrivee || docData.arrival) === normCity(selectedTrip!.arrival))) {
            seatsEmbarques += docData.seatsGo ?? 1;
          }
        });
        const resSnap = await getDoc(resRef);
        const dataPre = resSnap.exists() ? (resSnap.data() as { statutEmbarquement?: string; seatsGo?: number }) : null;
        const alreadyEmbarked = dataPre?.statutEmbarquement === "embarqué";
        const addSeats = alreadyEmbarked ? 0 : (dataPre?.seatsGo ?? 1);
        if (seatsEmbarques + addSeats > vehicleCapacity) {
          throw new Error("Capacité véhicule atteinte");
        }
      }

      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(resRef);
          if (!snap.exists()) throw new Error("Réservation introuvable");
          const data = snap.data() as Record<string, unknown>;

          // Phase B : refuser embarquement si billet annulé, remboursé, expiré ou déjà embarqué (on utilise le statut effectif, pas le brut)
          if (statut === "embarqué") {
            const effectiveStatut = getEffectiveStatut({
              statut: data.statut as string,
              date: data.date as string | { seconds: number; nanoseconds: number } | undefined,
            });
            if (!canEmbarkWithScan(effectiveStatut)) {
              const es = effectiveStatut ?? "";
              if (es === "embarque") throw new Error("Déjà embarqué");
              throw new Error("Billet non valide (annulé, remboursé ou expiré).");
            }
          }

          // normaliser pour comparer
          const dataDep = normCity(data.depart as string | undefined);
          const dataArr = normCity((data.arrivee ?? data.arrival) as string | undefined);
          const dataHr  = normTime((data.heure as string) ?? "");
          const dataDt  = normDate(data.date);

          const selDep  = normCity(selectedTrip!.departure);
          const selArr  = normCity(selectedTrip!.arrival);
          const selHr   = normTime(selectedTrip!.heure);
          const selDt   = normDate(selectedDate);

          const idMatch     = !!(data.trajetId && selectedTrip?.id && data.trajetId === selectedTrip.id);
          const fieldsMatch = (dataDep === selDep) && (dataArr === selArr) && (dataHr === selHr) && (dataDt === selDt);
          const softMatch   = (dataDep === selDep) && (dataArr === selArr) && (dataDt === selDt);

          // lecture weeklyTrips si nécessaire
          let weeklyTripMatch = false;
          const selTripId = selectedTrip?.id ?? (data.trajetId as string | null) ?? null;
          const resTripId = (data.trajetId as string | null) ?? null;
          if (!idMatch && (selTripId || resTripId)) {
            try {
              let selTripMeta: { departure?: string; arrival?: string } | null = null;
              let resTripMeta: { departure?: string; arrival?: string } | null = null;

              if (selectedTrip?.id) {
                const tSelRef = doc(db, `companies/${companyId}/agences/${agencyIdToUse}/weeklyTrips/${selectedTrip.id}`);
                const tSelSnap = await tx.get(tSelRef);
                if (tSelSnap.exists()) {
                  const d = tSelSnap.data() as { departure?: string; arrival?: string };
                  selTripMeta = { departure: d?.departure, arrival: d?.arrival };
                }
              } else if (selTripId) {
                const tSelRef = doc(db, `companies/${companyId}/agences/${agencyIdToUse}/weeklyTrips/${selTripId}`);
                const tSelSnap = await tx.get(tSelRef);
                if (tSelSnap.exists()) {
                  const d = tSelSnap.data() as { departure?: string; arrival?: string };
                  selTripMeta = { departure: d?.departure, arrival: d?.arrival };
                }
              }

              if (resTripId) {
                const tResRef = doc(db, `companies/${companyId}/agences/${agencyIdToUse}/weeklyTrips/${resTripId}`);
                const tResSnap = await tx.get(tResRef);
                if (tResSnap.exists()) {
                  const d = tResSnap.data() as { departure?: string; arrival?: string };
                  resTripMeta = { departure: d?.departure, arrival: d?.arrival };
                }
              }

              if (selTripMeta && resTripMeta) {
                const selDep2 = normCity(selTripMeta.departure);
                const selArr2 = normCity(selTripMeta.arrival);
                const resDep2 = normCity(resTripMeta.departure);
                const resArr2 = normCity(resTripMeta.arrival);
                weeklyTripMatch = (selDep2 === resDep2) && (selArr2 === resArr2);
              }
            } catch {}
          }

          if (!(idMatch || fieldsMatch || softMatch || weeklyTripMatch)) {
            throw new Error("Billet pour un autre départ (date/heure/trajet non concordants).");
          }

          // Phase 4.5: boardingStats + capacity check inside transaction (embarqué only)
          if (statut === "embarqué") {
            const tripKey = boardingStatsKey(selDep ?? "", selArr ?? "", selHr ?? "", selectedDate);
            const statsRef = getBoardingStatsRef(companyId, agencyIdToUse, tripKey);
            const statsSnap = await tx.get(statsRef);
            if (!statsSnap.exists()) {
              createBoardingStats(tx, companyId, agencyIdToUse, tripKey, {
                tripId: selectedTrip?.id ?? (data.trajetId as string | null) ?? null,
                date: selectedDate,
                heure: (selectedTrip?.heure ?? data.heure ?? "") as string,
                vehicleCapacity: vehicleCapacity ?? 0,
              });
              updateAgencyLiveStateOnBoardingOpened(tx, companyId, agencyIdToUse);
            }
            const currentEmbarked = statsSnap.exists()
              ? ((statsSnap.data() as { embarkedSeats?: number }).embarkedSeats ?? 0)
              : 0;
            const addSeats = (data.statutEmbarquement === "embarqué")
              ? 0
              : (Number(data.seatsGo) || 1);
            if (vehicleCapacity != null && vehicleCapacity > 0 && currentEmbarked + addSeats > vehicleCapacity) {
              throw new Error("Capacité véhicule atteinte");
            }
            incrementBoardingStatsEmbarked(tx, companyId, agencyIdToUse, tripKey, addSeats);
          }

          // verrou uniquement pour EMBARQUÉ (évite double-scan)
          if (data.statutEmbarquement === "embarqué" && statut === "embarqué") {
            throw new Error("Déjà embarqué");
          }
          const lockRef = doc(
            db,
            `companies/${companyId}/agences/${agencyIdToUse}/boardingLocks/${reservationId}`
          );
          const lockSnap = await tx.get(lockRef);
          if (lockSnap.exists() && statut === "embarqué") {
            throw new Error("Déjà embarqué");
          }
          if (statut === "embarqué" && !lockSnap.exists()) {
            tx.set(lockRef, {
              reservationId,
              by: uid,
              at: serverTimestamp(),
              tripId: selectedTrip?.id ?? data.trajetId ?? null,
              date: selectedDate,
              heure: selectedTrip?.heure ?? data.heure ?? null,
            });
          }

          const patch: any = {
            statutEmbarquement: statut,
            controleurId: uid,
            checkInTime: statut === "embarqué" ? serverTimestamp() : null,
          };
          if (statut === "embarqué") {
            patch.statut = "embarque";
            patch.auditLog = arrayUnion(
              buildStatutTransitionPayload(String(data.statut ?? ""), "embarque", {
                userId: uid,
                userRole: (user as { role?: string })?.role ?? "controleur_embarquement",
              })
            );
          }
          tx.update(resRef, patch);

          const logsRef = collection(
            db,
            `companies/${companyId}/agences/${agencyIdToUse}/boardingLogs`
          );
          tx.set(doc(logsRef), {
            reservationId,
            trajetId: selectedTrip?.id ?? data.trajetId ?? null,
            departure: selectedTrip?.departure ?? data.depart,
            arrival: selectedTrip?.arrival ?? data.arrivee ?? data.arrival,
            date: selectedDate,
            heure: selectedTrip?.heure ?? data.heure,
            result: (statut === "embarqué" ? "EMBARQUE" : statut).toUpperCase(),
            controleurId: uid,
            scannedAt: serverTimestamp(),
          });
        });

        try { new Audio("/beep.mp3").play(); } catch {}
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        if (msg.includes("Déjà embarqué")) {
          alert("Billet déjà embarqué.");
        } else if (msg.includes("Capacité véhicule atteinte")) {
          alert("Capacité véhicule atteinte. Impossible d'embarquer davantage.");
        } else if (msg.includes("non concordants")) {
          alert("Billet pour un autre départ (date/heure/trajet non concordants).");
        } else {
          alert("Erreur d’embarquement.");
        }
        console.error("[EMBARK][ERROR]", e);
      }
    },
    [companyId, selectedAgencyId, uid, selectedTrip?.id, selectedTrip?.departure, selectedTrip?.arrival, selectedTrip?.heure, selectedDate, vehicleCapacity]
  );

  /* ---------- Utilitaire : prochain départ ---------- */
  async function computeNextDeparture(
    dbRef: typeof db,
    companyId: string,
    agencyId: string,
    baseTrip: { id?: string; departure: string; arrival: string; heure: string; },
    baseDate: string
  ): Promise<{ date: string; heure: string }> {
    let target: any | null = null;
    if (baseTrip.id) {
      const s = await getDoc(doc(dbRef, `companies/${companyId}/agences/${agencyId}/weeklyTrips/${baseTrip.id}`));
      if (s.exists()) target = { id: s.id, ...(s.data() as any) };
    }
    if (!target) {
      const wref = collection(dbRef, `companies/${companyId}/agences/${agencyId}/weeklyTrips`);
      const wsnap = await getDocs(wref);
      target = wsnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
        .find(t => t.active && t.departure === baseTrip.departure && t.arrival === baseTrip.arrival) || null;
    }
    if (!target) throw new Error("Trajet hebdo introuvable.");

    const start = new Date(`${baseDate}T${baseTrip.heure || "00:00"}:00`);
    for (let add = 0; add < 14; add++) {
      const d = new Date(start);
      d.setDate(d.getDate() + add);
      const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
      const hours: string[] = (target.horaires?.[dayName] || []).slice().sort();

      if (!hours.length) continue;
      if (add === 0) {
        const after = hours.filter(h => h > baseTrip.heure);
        if (after.length) return { date: baseDate, heure: after[0] };
      } else {
        const iso = toLocalISO(d);
        return { date: iso, heure: hours[0] };
      }
    }
    throw new Error("Aucun prochain départ disponible.");
  }

  /* ---------- Absent + Reprogrammer (gardé pour la clôture) ---------- */
  const absentEtReprogrammer = useCallback(async (reservationId: string) => {
    if (!companyId || !selectedAgencyId || !uid || !selectedTrip || !selectedDate) {
      alert("Contexte incomplet (agence, trajet ou date manquants).");
      return;
    }

    const resRef = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations/${reservationId}`);
    const resSnap = await getDoc(resRef);
    if (!resSnap.exists()) return alert("Réservation introuvable.");
    const data = resSnap.data() as Reservation & Record<string, any>;

    if (data.noShowAt || data.reprogrammedOnce === true) {
      return; // silencieux
    }

    try {
      const next = await computeNextDeparture(
        db, companyId, selectedAgencyId,
        {
          id: data.trajetId || selectedTrip.id,
          departure: (data.depart || selectedTrip.departure)!,
          arrival: (data.arrivee || data.arrival || selectedTrip.arrival)!,
          heure: (data.heure || selectedTrip.heure)!,
        },
        (normDate(data.date) || selectedDate)!
      );

      const batch = writeBatch(db);
      batch.update(resRef, {
        statutEmbarquement: "absent",
        noShowAt: serverTimestamp(),
        noShowBy: uid,
        reprogrammedOnce: true,
      });

      const newRef = doc(collection(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations`));
      batch.set(newRef, {
        companyId, agencyId: selectedAgencyId,
        depart: data.depart, arrivee: data.arrivee || data.arrival, trajetId: data.trajetId || selectedTrip.id || null,
        date: next.date, heure: next.heure,
        nomClient: data.nomClient, telephone: data.telephone,
        seatsGo: (data as any).seatsGo || 1,
        canal: "report",
        statut: "confirme",
        statutEmbarquement: "en_attente",
        sourceReservationId: reservationId,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });

      const logRef = doc(collection(db, `companies/${companyId}/agences/${selectedAgencyId}/boardingLogs`));
      batch.set(logRef, {
        reservationId,
        trajetId: data.trajetId || selectedTrip.id || null,
        departure: data.depart, arrival: data.arrivee || data.arrival,
        date: selectedDate, heure: selectedTrip.heure,
        result: "ABSENT_REPROG",
        nextDate: next.date, nextHeure: next.heure,
        controleurId: uid,
        scannedAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (e: any) {
      console.error(e);
    }
  }, [companyId, selectedAgencyId, uid, selectedTrip, selectedDate]);

  /* ---------- Clé du départ + état clôture ---------- */
  const tripKey = useMemo(() => {
    if (!selectedTrip || !selectedDate) return null;
    const dep = normCity(selectedTrip.departure);
    const arr = normCity(selectedTrip.arrival);
    const hr  = normTime(selectedTrip.heure);
    const dt  = normDate(selectedDate);
    if (!dep || !arr || !hr || !dt) return null;
    return `${dep}_${arr}_${hr}_${dt}`;
  }, [selectedTrip, selectedDate]);
  const [isClosed, setIsClosed] = useState(false);

  useEffect(() => {
    if (!companyId || !selectedAgencyId || !tripKey) { setIsClosed(false); return; }
    const ref = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/boardingClosures/${tripKey}`);
    const unsub = onSnapshot(ref, (s) => setIsClosed(s.exists()));
    return () => unsub();
  }, [companyId, selectedAgencyId, tripKey]);

  /* ---------- Clôturer : un seul passage + verrou + reprogrammation ---------- */
  const cloturerEmbarquement = useCallback(async () => {
    if (!companyId || !selectedAgencyId || !uid || !selectedTrip || !selectedDate) {
      alert("Contexte incomplet (agence, trajet ou date manquants).");
      return;
    }
    if (reservations.length === 0) {
      alert("Aucune réservation à traiter.");
      return;
    }
    if (!tripKey) {
      alert("Trajet invalide.");
      return;
    }

    const lockRef = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/boardingClosures/${tripKey}`);
    const tripId = selectedTrip.id ?? null;

    // Pre-query fleet vehicles for this departure (for atomic transaction)
    let vehicleIds: Array<{ id: string }> = [];
    try {
      const fleetRef = collection(db, `companies/${companyId}/fleetVehicles`);
      const qFleet = query(
        fleetRef,
        where("currentAgencyId", "==", selectedAgencyId),
        where("currentDate", "==", selectedDate),
        where("currentHeure", "==", selectedTrip.heure),
        where("status", "==", "assigned")
      );
      const fleetSnap = await getDocs(qFleet);
      vehicleIds = fleetSnap.docs
        .filter((d) => (d.data() as { currentTripId?: string | null }).currentTripId === tripId)
        .map((d) => ({ id: d.id }));
    } catch {
      // non-blocking; transaction will proceed without fleet update
    }

    try {
      // Single transaction: lock + absents + closure + boardingLog CLOSURE + vehicle(s) → in_transit + fleetMovements
      await runTransaction(db, async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists()) {
          throw new Error("DEJA_CLOTURE");
        }

        // Marquer comme ABSENT tout ce qui n'est pas embarqué
        for (const r of reservations) {
          const embarked = r.statutEmbarquement === "embarqué";
          if (!embarked) {
            const resRef = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations/${r.id}`);
            tx.update(resRef, {
              statutEmbarquement: "absent",
              noShowAt: serverTimestamp(),
              noShowBy: uid,
            });
          }
        }

        // Verrou de clôture
        tx.set(lockRef, {
          closedAt: serverTimestamp(),
          closedBy: uid,
          date: selectedDate,
          heure: selectedTrip.heure,
          departure: selectedTrip.departure,
          arrival: selectedTrip.arrival,
        });

        // Boarding log entry for CLOSURE (audit)
        const boardingLogRef = doc(collection(db, `companies/${companyId}/agences/${selectedAgencyId}/boardingLogs`));
        tx.set(boardingLogRef, {
          result: "CLOSURE",
          date: selectedDate,
          heure: selectedTrip.heure,
          departure: selectedTrip.departure,
          arrival: selectedTrip.arrival,
          trajetId: tripId,
          closedBy: uid,
          scannedAt: serverTimestamp(),
        });

        // Phase 4.5: dailyStats, boardingStats, agencyLiveState
        updateDailyStatsOnBoardingClosed(tx, companyId, selectedAgencyId, selectedDate);
        const tripKey = boardingStatsKey(selectedTrip.departure, selectedTrip.arrival, selectedTrip.heure, selectedDate);
        const absentSeats = reservations
          .filter((r) => r.statutEmbarquement !== "embarqué")
          .reduce((sum, r) => sum + ((r as { seatsGo?: number }).seatsGo ?? 1), 0);
        setBoardingStatsClosed(tx, companyId, selectedAgencyId, tripKey, absentSeats);
        updateAgencyLiveStateOnBoardingClosed(tx, companyId, selectedAgencyId);

        // Fleet: assigned → in_transit + fleetMovement per vehicle
        const fleetMovementsRef = collection(db, `companies/${companyId}/fleetMovements`);
        const vehicleUpdatePayload = buildVehicleTransitionToInTransit(selectedAgencyId, null, uid);
        let vehiclesTransitioned = 0;

        for (const { id: vehicleId } of vehicleIds) {
          const vehicleRef = doc(db, `companies/${companyId}/fleetVehicles/${vehicleId}`);
          const vehicleSnap = await tx.get(vehicleRef);
          if (!vehicleSnap.exists()) continue;
          const vData = vehicleSnap.data() as { status: string; currentTripId?: string | null };
          if (vData.status !== "assigned" || vData.currentTripId !== tripId) continue;
          if (!canTransition("assigned", "in_transit")) continue;

          tx.update(vehicleRef, vehicleUpdatePayload);
          const movementRef = doc(fleetMovementsRef);
          tx.set(movementRef, createFleetMovementPayload(
            vehicleId,
            selectedAgencyId,
            null,
            tripId,
            selectedDate,
            selectedTrip.heure,
            uid,
            "assigned",
            "in_transit"
          ));
          vehiclesTransitioned += 1;
        }
        if (vehiclesTransitioned > 0) {
          updateAgencyLiveStateOnVehicleInTransit(tx, companyId, selectedAgencyId, vehiclesTransitioned);
        }
      });

      // Reprogrammer les absents (hors transaction, batch)
      const batch = writeBatch(db);

      for (const r of reservations) {
        const embarked = r.statutEmbarquement === "embarqué";
        if (embarked) continue;

        if ((r as any).reprogrammedOnce === true) continue;

        const exists = await getDocs(
          query(
            collection(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations`),
            where("sourceReservationId", "==", r.id),
            fsLimit(1)
          )
        );
        if (!exists.empty) continue;

        try {
          const next = await computeNextDeparture(
            db, companyId, selectedAgencyId,
            {
              id: r.trajetId || selectedTrip.id,
              departure: r.depart || selectedTrip.departure,
              arrival: r.arrivee || r.arrival || selectedTrip.arrival,
              heure: r.heure || selectedTrip.heure,
            },
            normDate(r.date) || selectedDate
          );

          const newRef = doc(collection(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations`));
          batch.set(newRef, {
            companyId, agencyId: selectedAgencyId,
            depart: r.depart, arrivee: r.arrivee || r.arrival,
            trajetId: r.trajetId || selectedTrip.id || null,
            date: next.date, heure: next.heure,
            nomClient: r.nomClient, telephone: r.telephone,
            seatsGo: (r as any).seatsGo || 1,
            canal: "report",
            statut: "confirme",
            statutEmbarquement: "en_attente",
            sourceReservationId: r.id,
            createdBy: uid,
            createdAt: serverTimestamp(),
          });

          const srcRef = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations/${r.id}`);
          batch.update(srcRef, { reprogrammedOnce: true });

          const logRef = doc(collection(db, `companies/${companyId}/agences/${selectedAgencyId}/boardingLogs`));
          batch.set(logRef, {
            reservationId: r.id,
            trajetId: r.trajetId || selectedTrip.id || null,
            departure: r.depart,
            arrival: r.arrivee || r.arrival,
            date: selectedDate,
            heure: selectedTrip.heure,
            result: "ABSENT_REPROG",
            nextDate: next.date,
            nextHeure: next.heure,
            controleurId: uid,
            scannedAt: serverTimestamp(),
          });
        } catch (err) {
          console.warn("Pas de prochain départ pour", r.id, err);
        }
      }

      await batch.commit();

      alert("Clôture effectuée. Absents marqués et reprogrammés (si possible).");
    } catch (e: any) {
      if (String(e?.message || e) === "DEJA_CLOTURE") {
        alert("Déjà clôturé : aucune action répétée.");
      } else {
        console.error(e);
        alert("Erreur lors de la clôture.");
      }
    }
  }, [companyId, selectedAgencyId, uid, selectedTrip, selectedDate, reservations, tripKey]);

  /* ---------- Saisie manuelle ---------- */
  const [scanCode, setScanCode] = useState("");
  const submitManual = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!companyId) return;

      const code = extractCode(scanCode);
      if (!code) return;

      try {
        const found = await findReservationByCode(
          companyId,
          selectedAgencyId,
          code,
          selectedTrip ? {
            dep: selectedTrip.departure,
            arr: selectedTrip.arrival,
            date: selectedDate,
            heure: selectedTrip.heure,
            weeklyTripId: selectedTrip.id || null,
          } : undefined
        );
        if (found) {
          await updateStatut(found.resId, "embarqué", found.agencyId);
          setScanCode("");
        } else {
          alert("Réservation introuvable.");
        }
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la validation manuelle.");
      }
    },
    [scanCode, companyId, selectedAgencyId, updateStatut, selectedTrip, selectedDate]
  );

  /* ---------- Scanner caméra ---------- */
  useEffect(() => {
    if (!scanOn) {
      readerRef.current?.reset?.();
      readerRef.current = null;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    (async () => {
      try {
        // @ts-ignore
        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current as HTMLVideoElement,
          async (res: any) => {
            const now = Date.now();
            if (!res || now - lastScanRef.current < 1200) return;
            lastScanRef.current = now;

            const raw = getScanText(res);
            const code = extractCode(raw);
            try {
              const found = await findReservationByCode(
                companyId!,
                selectedAgencyId,
                code,
                selectedTrip ? {
                  dep: selectedTrip.departure,
                  arr: selectedTrip.arrival,
                  date: selectedDate,
                  heure: selectedTrip.heure,
                  weeklyTripId: selectedTrip.id || null,
                } : undefined
              );
              if (found) {
                await updateStatut(found.resId, "embarqué", found.agencyId);
              } else {
                if (now - lastAlertRef.current > 2000) {
                  lastAlertRef.current = now;
                  alert("Billet introuvable.");
                }
              }
            } catch (e) {
              console.error(e);
              if (now - lastAlertRef.current > 2000) {
                lastAlertRef.current = now;
                alert("Erreur lors du scan");
              }
            }
          }
        );
      } catch {
        const devices = (await BrowserMultiFormatReader.listVideoInputDevices()) as unknown as Array<{ deviceId?: string }>;
        const preferred: string | null = devices?.[0]?.deviceId ?? null;
        await reader.decodeFromVideoDevice(
          (preferred as unknown) as string | null,
          videoRef.current as HTMLVideoElement,
          async (res: any) => {
            const now = Date.now();
            if (!res || now - lastScanRef.current < 1200) return;
            lastScanRef.current = now;

            const raw = getScanText(res);
            const code = extractCode(raw);
            try {
              const found = await findReservationByCode(
                companyId!,
                selectedAgencyId,
                code,
                selectedTrip ? {
                  dep: selectedTrip.departure,
                  arr: selectedTrip.arrival,
                  date: selectedDate,
                  heure: selectedTrip.heure,
                  weeklyTripId: selectedTrip.id || null,
                } : undefined
              );
              if (found) {
                await updateStatut(found.resId, "embarqué", found.agencyId);
              } else {
                if (now - lastAlertRef.current > 2000) {
                  lastAlertRef.current = now;
                  alert("Billet introuvable.");
                }
              }
            } catch (e) {
              console.error(e);
              if (now - lastAlertRef.current > 2000) {
                lastAlertRef.current = now;
                alert("Erreur lors du scan");
              }
            }
          }
        );
      }
    })();

    return () => {
      readerRef.current?.reset?.();
      readerRef.current = null;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [scanOn, companyId, selectedAgencyId, updateStatut, selectedTrip, selectedDate]);

  /* ---------- Filtre & Totaux ---------- */
  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase().trim();
    if (!t) return reservations;
    return reservations.filter(
      (r) =>
        (r.nomClient || "").toLowerCase().includes(t) ||
        (r.telephone || "").includes(searchTerm)
    );
  }, [reservations, searchTerm]);

  const totals = useMemo(() => {
    let totalRes = 0, totalSeats = 0, seatsEmbarques = 0, seatsAbsents = 0;
    for (const r of reservations) {
      const seats = r.seatsGo ?? 1;
      totalRes += 1;
      totalSeats += seats;
      if (r.statutEmbarquement === "embarqué") seatsEmbarques += seats;
      if (r.statutEmbarquement === "absent") seatsAbsents += seats;
    }
    return { totalRes, totalSeats, seatsEmbarques, seatsAbsents };
  }, [reservations]);

  const humanDate = useMemo(() => {
    try {
      const d = new Date(selectedDate + "T00:00:00");
      return format(d, "dd/MM/yyyy");
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const dayName = useMemo(
    () => weekdayFR(new Date(selectedDate)),
    [selectedDate]
  );

  const trajetButtons = useMemo(() => {
    if (!trajetsDuJour.length) return [] as JSX.Element[];
    return trajetsDuJour.flatMap((trip) =>
      (trip.horaires[dayName] || []).map((h) => {
        const active =
          selectedTrip?.departure === trip.departure &&
          selectedTrip?.arrival === trip.arrival &&
          selectedTrip?.heure === h;
        return (
          <button
            key={`${trip.id}_${h}`}
            onClick={() =>
              setSelectedTrip({
                id: trip.id,
                departure: trip.departure,
                arrival: trip.arrival,
                heure: h,
              })
            }
            className={`px-3 py-2 rounded-lg text-sm font-medium shadow-sm ${
              active ? "text-white" : "bg-gray-200 text-gray-700"
            }`}
            style={active ? { background: theme.primary } : undefined}
          >
            {trip.departure} → {trip.arrival} à {h}
          </button>
        );
      })
    );
  }, [trajetsDuJour, dayName, selectedTrip, theme.primary]);

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-600">
        Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: theme.bg }}>
      <style>{`
        .brand-logo{height:40px;width:auto;object-fit:contain}
        .case{display:inline-flex;align-items:center;justify-content:center;min-width:20px;min-height:20px;width:20px;height:20px;border:2px solid #0f172a;border-radius:6px;background:#fff;cursor:pointer;user-select:none}
        .case[data-checked="true"]::after{content:"✓";font-weight:700;font-size:12px}

        .thin-table { table-layout: fixed; }
        .thin-table th, .thin-table td { padding: 6px 8px; }
        .col-idx{width:40px}
        .col-client{width:24%}
        .col-phone{width:14%}
        .col-canal{width:12%}
        .col-ref{width:18%}
        .col-seats{width:8%}
        .col-emb{width:8%}
        .col-abs{width:8%}

        @media (max-width: 640px){
          .col-client{width:38%}
          .col-phone{width:18%}
          .col-ref{width:22%}
        }

        /* Header imprimable centré */
        #print-area .title{ text-align:center; font-weight:800; font-size:18px; }
        #print-area .subtitle{ text-align:center; font-size:14px; margin-top:2px; }

        /* zones signatures épurées */
        #print-area .sig-box {
          border: 1px solid #000;
          min-height: 28mm;
          border-radius: 6px;
        }
        #print-area .sig-caption { text-align:center; margin-top:6px; }

        @media print{
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; inset: 0; padding: 0 8mm; }
          .brand-logo{height:26px}
          .case{width:14px;height:14px;border:1.5px solid #000;border-radius:0}
          .case::after{font-size:12px;line-height:1}
          tr.embarked { background:transparent !important; color:inherit !important; }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filtre Agence + Date */}
        <div className="no-print bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 p-4 shadow-md space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold" style={{ color: theme.secondary }}>
                Agence :
              </span>
              {selectedAgencyId ? (
                <span className="px-2 py-1 rounded border bg-gray-50 text-sm">
                  {agencyInfo?.nomAgence || "—"}
                </span>
              ) : (
                <select
                  className="px-2 py-1 border rounded text-sm"
                  value={selectedAgencyId || ""}
                  onChange={(e) => setSelectedAgencyId(e.target.value || null)}
                >
                  <option value="">— Choisir une agence —</option>
                  {agencies.map(a => (
                    <option key={a.id} value={a.id}>{a.nom}</option>
                  ))}
                </select>
              )}
            </div>

            <span className="font-semibold" style={{ color: theme.secondary }}>
              Date :
            </span>
            <button
              className="px-2 py-1 rounded border"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(toLocalISO(d));
              }}
            >
              ◀ Jour précédent
            </button>
            <input
              type="date"
              className="border rounded px-3 py-1"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button
              className="px-2 py-1 rounded border"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(toLocalISO(d));
              }}
            >
              Jour suivant ▶
            </button>
          </div>

          <div className="font-semibold">Sélectionner un trajet</div>
          <div className="flex flex-wrap gap-2">
            {!selectedAgencyId ? (
              <div className="text-gray-500 dark:text-gray-200">Choisissez d’abord une agence.</div>
            ) : trajetsDuJour.length === 0 ? (
              <div className="text-gray-500 dark:text-gray-200">Aucun trajet planifié pour cette date</div>
            ) : (
              trajetButtons
            )}
          </div>
        </div>

        {/* Infos départ + actions */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-md">
          <div className="px-4 pt-4 flex flex-wrap items-center gap-3">
            <div className="text-sm text-gray-500 dark:text-gray-200">Trajet</div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {selectedTrip ? (
                <>
                  {selectedTrip.departure} — {selectedTrip.arrival} • {humanDate} à {selectedTrip.heure}
                </>
              ) : (
                "Aucun trajet sélectionné"
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              <div className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white font-medium">
                <span className="opacity-90">Réservations:</span> <b>{totals.totalRes}</b>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white font-medium">
                <span className="opacity-90">Places:</span> <b>{totals.totalSeats}</b>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-green-600 text-white font-medium">
                <span className="opacity-90">Embarqués:</span> <b>{totals.seatsEmbarques}</b>
              </div>
              <div className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-medium">
                <span className="opacity-90">Absent:</span> <b>{totals.seatsAbsents}</b>
              </div>
              {vehicleCapacity != null && (
                <div className="px-2 py-1 rounded bg-blue-50 dark:bg-slate-700 border border-blue-200 dark:border-slate-600">
                  <span className="text-gray-500 dark:text-gray-200">Capacité véhicule:</span> <b className="text-gray-900 dark:text-white">{vehicleCapacity}</b> places
                  {vehicleCapacity > 0 && (
                    <span className="ml-1 text-sm"> — Remplissage: {Math.round((totals.seatsEmbarques / vehicleCapacity) * 100)}%</span>
                  )}
                </div>
              )}
              {vehicleCapacity != null && vehicleCapacity > 0 && totals.seatsEmbarques >= vehicleCapacity && (
                <div className="px-2 py-1 rounded bg-amber-100 border border-amber-300 text-amber-800 text-sm font-medium">
                  Capacité atteinte
                </div>
              )}
            </div>
          </div>

          {/* Cartes info bus / chauffeur / convoyeur (depuis affectation Phase 1) */}
          <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-gray-200 dark:border-slate-600 rounded-xl p-3 bg-gray-50 dark:bg-slate-800 shadow-md">
              <div className="text-xs text-gray-500 dark:text-gray-200 mb-1">Véhicule / Plaque</div>
              <div className="font-medium text-gray-900 dark:text-white">
                {assign.bus || assign.immat ? `${assign.bus || "—"} / ${assign.immat || "—"}` : "— / —"}
              </div>
            </div>
            <div className="border border-gray-200 dark:border-slate-600 rounded-xl p-3 bg-gray-50 dark:bg-slate-800 shadow-md">
              <div className="text-xs text-gray-500 dark:text-gray-200 mb-1">Chauffeur</div>
              <div className="font-medium text-gray-900 dark:text-white">{assign.chauffeur || "—"}</div>
              {assign.chauffeurPhone && (
                <div className="text-xs text-gray-600 dark:text-gray-200 mt-0.5">Tél. {assign.chauffeurPhone}</div>
              )}
            </div>
            <div className="border border-gray-200 dark:border-slate-600 rounded-xl p-3 bg-gray-50 dark:bg-slate-800 shadow-md">
              <div className="text-xs text-gray-500 dark:text-gray-200 mb-1">Convoyeur</div>
              <div className="font-medium text-gray-900 dark:text-white">{assign.chef || "—"}</div>
              {assign.chefPhone && (
                <div className="text-xs text-gray-600 dark:text-gray-200 mt-0.5">Tél. {assign.chefPhone}</div>
              )}
            </div>
          </div>

          <div className="no-print px-4 pb-3 flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Rechercher nom / téléphone…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setScanOn((v) => !v)}
              className={`w-full sm:w-auto px-3 py-2 rounded-lg text-sm min-h-[40px] ${
                scanOn ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-200"
              }`}
              title="Activer le scanner (QR / code-barres)"
              disabled={!selectedTrip || !selectedAgencyId}
            >
              {scanOn ? "Scanner ON" : "Scanner OFF"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:w-auto px-3 py-2 rounded-lg text-sm border border-gray-300 dark:border-slate-600 min-h-[40px]"
              title="Imprimer la liste"
            >
              🖨️ Imprimer
            </button>
            <button
              type="button"
              onClick={cloturerEmbarquement}
              className={`w-full sm:w-auto px-3 py-2 rounded-lg text-sm min-h-[40px] ${isClosed ? "bg-gray-300 text-gray-600" : "bg-red-600 text-white"}`}
              title={isClosed ? "Déjà clôturé" : "Clôturer l’embarquement"}
              disabled={!selectedTrip || !selectedAgencyId || isClosed}
            >
              {isClosed ? "Clôturé" : "🚍 Clôturer"}
            </button>
          </div>

          {scanOn && (
            <div className="no-print px-4 pb-4 w-full">
              <video
                ref={videoRef}
                className="w-full sm:max-w-md aspect-video bg-black rounded-xl overflow-hidden"
                muted
                playsInline
                autoPlay
              />
            </div>
          )}
        </div>

        {/* Saisie manuelle */}
        <div className="no-print bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-md p-4">
          <div className="text-sm font-semibold mb-2" style={{ color: theme.secondary }}>
            Saisir une référence
          </div>
          <form onSubmit={submitManual} className="flex gap-2">
            <input
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="ID Firestore ou référence (REF-… / MT-…)"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg text-white text-sm"
              style={{ background: theme.primary }}
              disabled={!selectedAgencyId && !userAgencyId}
            >
              Valider
            </button>
          </form>
        </div>

        {/* Zone imprimable */}
        <div id="print-area" className="bg-white rounded-xl border shadow-sm">
          <div className="px-4 pt-4">
            {/* Bandeau logo + société + agence */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {company?.logoUrl && (
                  <img
                    src={(company as any).logoUrl}
                    alt={(company as any)?.nom}
                    className="brand-logo"
                  />
                )}
                <div>
                  <div className="font-extrabold text-lg">
                  {company?.nom ?? "—"}
                </div>
                  <div className="text-xs text-gray-500 dark:text-gray-200">
                  {agencyInfo?.nomAgence || "Agence"} • Tel. {agencyInfo?.telephone || "—"}
                 </div>
                </div>
              </div>
            </div>

            {/* Titre centré + destination */}
            <div className="mt-2">
              <div className="title">Liste d’embarquement</div>
              {selectedTrip && (
                <div className="subtitle text-gray-700 dark:text-gray-200">
                  {selectedTrip.departure} → {selectedTrip.arrival} • {humanDate} • {selectedTrip.heure}
                </div>
              )}
            </div>

            {/* Méta + totaux (plaque, modèle, chauffeur, convoyeur depuis affectation) */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div className="meta-card bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                <div className="text-xs text-gray-500 dark:text-gray-200">Véhicule / Plaque</div>
                <div className="font-medium">
                  {(assign.bus || "—") + " / " + (assign.immat || "—")}
                </div>
              </div>
              <div className="meta-card bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                <div className="text-xs text-gray-500 dark:text-gray-200">Chauffeur</div>
                <div className="font-medium">{assign.chauffeur || "—"}</div>
                {assign.chauffeurPhone && <div className="text-xs text-gray-600 dark:text-gray-200">Tél. {assign.chauffeurPhone}</div>}
              </div>
              <div className="meta-card bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                <div className="text-xs text-gray-500 dark:text-gray-200">Convoyeur</div>
                <div className="font-medium">{assign.chef || "—"}</div>
                {assign.chefPhone && <div className="text-xs text-gray-600 dark:text-gray-200">Tél. {assign.chefPhone}</div>}
              </div>
              <div className="meta-card bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                <div className="text-xs text-gray-500 dark:text-gray-200">Totaux</div>
                <div className="font-medium">
                  R: {totals.totalRes} • P: {totals.totalSeats} • E: {totals.seatsEmbarques} • A: {totals.seatsAbsents}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto mt-3" style={{ minWidth: 0 }}>
            <table className="w-full text-sm thin-table min-w-[600px]" style={{ fontSize: "14px" }}>
              <colgroup>
                <col className="col-idx" />
                <col className="col-client" />
                <col className="col-phone" />
                <col className="col-canal" />
                <col className="col-ref" />
                <col className="col-seats" />
                <col className="col-emb" />
                <col className="col-abs" />
              </colgroup>
              <thead className="bg-gray-50 dark:bg-slate-800 dark:border-slate-600">
                <tr>
                  <th className="text-left text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-600">#</th>
                  <th className="text-left text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-600">Client</th>
                  <th className="text-left text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-600">Téléphone</th>
                  <th className="text-left text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-600">Canal</th>
                  <th className="text-left text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-600">Référence</th>
                  <th className="text-center text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-600">Places</th>
                  <th className="text-center text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-600">Embarqué</th>
                  <th className="text-center text-gray-900 dark:text-white border-b border-gray-200 dark:border-slate-600">Absent</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="py-4 text-gray-500 dark:text-gray-200" colSpan={8}>
                      Chargement…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="py-4 text-gray-400 dark:text-gray-200" colSpan={8}>
                      Aucun passager trouvé
                    </td>
                  </tr>
                ) : (
                  filtered.map((r, idx) => {
                    const embarked = r.statutEmbarquement === "embarqué";
                    const absent   = r.statutEmbarquement === "absent";
                    const seats = r.seatsGo ?? 1;
                    return (
                      <tr
                        key={r.id}
                        className={`border-t border-gray-200 dark:border-slate-600 ${embarked ? "embarked bg-gray-50 dark:bg-slate-700 text-slate-700 dark:text-white" : `bg-white ${idx % 2 === 0 ? "dark:bg-slate-900" : "dark:bg-slate-800"} text-gray-900 dark:text-white`}`}
                      >
                        <td className={embarked ? "text-slate-700 dark:text-white" : "text-gray-900 dark:text-white"}>{idx + 1}</td>
                        <td className={`truncate ${embarked ? "text-slate-700 dark:text-white" : "text-gray-900 dark:text-white"}`}>{r.nomClient || "—"}</td>
                        <td className={`truncate ${embarked ? "text-slate-700 dark:text-white" : "text-gray-900 dark:text-white"}`}>{r.telephone || "—"}</td>
                        <td className={`capitalize truncate ${embarked ? "text-slate-700 dark:text-white" : "text-gray-900 dark:text-white"}`}>{r.canal || "—"}</td>
                        <td className={`truncate ${embarked ? "text-slate-700 dark:text-white" : "text-gray-900 dark:text-white"}`}>{r.referenceCode || r.id}</td>
                        <td className={`text-center font-semibold ${embarked ? "text-slate-700 dark:text-white" : "text-gray-900 dark:text-white"}`}>{seats}</td>
                        <td className="text-center">
                          <button
                            className="case"
                            data-checked={embarked}
                            onClick={() => updateStatut(r.id, embarked ? "en_attente" : "embarqué")}
                            title="Basculer Embarqué"
                          />
                        </td>
                        <td className="text-center">
                          <button
                            className="case"
                            data-checked={absent}
                            onClick={() => updateStatut(r.id, absent ? "en_attente" : "absent")}
                            title="Basculer Absent"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Signatures */}
          <div className="px-4 py-6 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <div className="sig-box" />
                <div className="sig-caption">Contrôleur / Chef d’embarquement — Nom & Signature</div>
              </div>
              <div>
                <div className="sig-box" />
                <div className="sig-caption">Chauffeur — Nom & Signature</div>
              </div>
              <div>
                <div className="sig-box" />
                <div className="sig-caption">Visa Agence</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgenceEmbarquementPage;
