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
import DatePicker from "react-datepicker";
import { fr } from "date-fns/locale";
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
import { dailyStatsTimezoneFromAgencyData, updateDailyStatsOnBoardingClosed } from "@/modules/agence/aggregates/dailyStats";
import {
  updateAgencyLiveStateOnBoardingOpened,
  updateAgencyLiveStateOnBoardingClosed,
  updateAgencyLiveStateOnVehicleInTransit,
} from "@/modules/agence/aggregates/agencyLiveState";
import { getAffectationForBoarding } from "@/modules/compagnie/fleet/affectationService";
import { getEffectiveStatut, canEmbarkWithScan, RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { buildStatutTransitionPayload } from "@/modules/agence/services/reservationStatutService";
import { ensureProgressArrival, markOriginDeparture, ensureAutoDepartIfNeeded, getTripProgress, ORIGIN_STOP_ORDER } from "@/modules/compagnie/tripInstances/tripProgressService";
import { findTripInstanceBySlot } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { vehicleRef } from "@/modules/compagnie/fleet/vehiclesService";
import {
  BOARDING_SESSION_IN_USE_MSG,
  boardingEmbarkDedupDocRef,
  closeBoardingSessionLock,
  countExpectedReservationsForTripSlot,
  getVehicleCapacity,
  listBoardingTripAssignmentsForDate,
  startBoardingSessionLock,
  tripAssignmentDocId,
  type TripAssignmentDoc,
} from "@/modules/agence/planning/tripAssignmentService";
import {
  buildTripExecutionIdFromSlot,
  ensureTripExecutionOnBoardingStart,
  tripExecutionRef,
} from "@/modules/compagnie/tripExecutions/tripExecutionService";
import {
  clearBoardingSlotSnapshot,
  getOrCreateBoardingClientInstanceId,
  loadBoardingSlotSnapshot,
  persistBoardingSlotSnapshot,
  snapshotMatchesSelection,
  type BoardingSlotSnapshotV1,
} from "@/modules/agence/embarquement/boardingSlotSnapshot";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { Bus, CheckCircle, AlertTriangle } from "lucide-react";
import {
  addToBoardingQueue,
  getUnsyncedBoardingQueue,
  markBoardingQueueSynced,
} from "@/modules/agence/embarquement/boardingQueue";
import { logAgentHistoryEvent } from "@/modules/agence/services/agentHistoryService";
import "react-datepicker/dist/react-datepicker.css";

const FAST_BOARDING_OVERLAY_DURATION_MS = 1200;
const INVALID_RESERVATION_STATUT = "invalide";

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
  /** Déprécié : utiliser boardingStatus. Conservé pour compatibilité affichage. */
  statutEmbarquement?: StatutEmbarquement;
  /** Source de vérité embarquement : pending | boarded | no_show */
  boardingStatus?: string;
  checkInTime?: any;
  trajetId?: string;
  referenceCode?: string;
  controleurId?: string;
  arrival?: string;
  seatsGo?: number;
  destinationStopOrder?: number | null;
}

/** Retourne le statut d'embarquement effectif (boardingStatus prioritaire, fallback statutEmbarquement). */
function getEffectiveBoardingStatus(r: { boardingStatus?: string; statutEmbarquement?: string }): "boarded" | "no_show" | "pending" {
  const b = (r.boardingStatus ?? "").toLowerCase();
  if (b === "boarded") return "boarded";
  if (b === "no_show") return "no_show";
  const s = (r.statutEmbarquement ?? "").toLowerCase();
  if (s === "embarqué" || s === "embarque") return "boarded";
  if (s === "absent") return "no_show";
  return "pending";
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
  /** Capacité sièges : priorité à cette valeur (ex. flux boarding/scan depuis tripAssignment). */
  vehicleCapacity?: number | null;
  /** Statut tripAssignment affiché en badge (flux scan). Sinon déduit de la sélection locale. */
  boardingAssignmentStatus?: "planned" | "validated";
}
const AgenceEmbarquementPage: React.FC<AgenceEmbarquementPageProps> = ({
  vehicleCapacity = null,
  boardingAssignmentStatus: boardingAssignmentStatusProp,
}) => {
  const { user, company } = useAuth() as any;
  const location = useLocation() as {
    state?: {
      trajet?: string;
      date?: string;
      heure?: string;
      agencyId?: string;
      tripId?: string;
      departure?: string;
      arrival?: string;
      assignmentId?: string;
      vehicleId?: string;
      assignmentStatus?: "planned" | "validated";
    };
  };

  // Use global Teliya brand variables so this page matches the unified agency theme
  const primary = "var(--teliya-primary)";
  const secondary = "var(--teliya-secondary)";

  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;
  const uid = user?.uid ?? null;

  const [agencies, setAgencies] = useState<AgencyItem[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(userAgencyId);
  const [agencyInfo, setAgencyInfo] = useState<any | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(
    location.state?.date || toLocalISO(new Date())
  );
  const selectedDateObj = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);

  const [weeklyForDay, setWeeklyForDay] = useState<WeeklyTrip[]>([]);
  const [dayAssignments, setDayAssignments] = useState<Array<TripAssignmentDoc & { id: string }>>([]);
  const [activeBoardingAssignment, setActiveBoardingAssignment] = useState<{
    id: string;
    vehicleId: string;
    status: "planned" | "validated";
  } | null>(null);
  const [resolvedVehicleCapacity, setResolvedVehicleCapacity] = useState<number | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<SelectedTrip | null>(null);

  const capacityLimit = vehicleCapacity != null ? vehicleCapacity : resolvedVehicleCapacity;
  const assignmentStatusBadge = activeBoardingAssignment?.status ?? null;
  const fallbackBoardingAssignment = useMemo(() => {
    if (!selectedTrip) return null;
    const match = dayAssignments.find((a) => {
      const sameTrip = String(a.tripId ?? "") === String(selectedTrip.id ?? "");
      const sameHeure = String(a.heure ?? "").trim() === String(selectedTrip.heure ?? "").trim();
      const statusOk = a.status === "planned" || a.status === "validated";
      const hasVehicle = String(a.vehicleId ?? "").trim().length > 0;
      return sameTrip && sameHeure && statusOk && hasVehicle;
    });
    if (!match) return null;
    return {
      id: match.id,
      vehicleId: String(match.vehicleId ?? "").trim(),
      status: (match.status === "validated" ? "validated" : "planned") as "planned" | "validated",
    };
  }, [selectedTrip, dayAssignments]);
  const selectedTripAssignment = useMemo(() => {
    if (!selectedTrip) return null;
    const match = dayAssignments.find((a) => {
      const sameTrip = String(a.tripId ?? "") === String(selectedTrip.id ?? "");
      const sameHeure = String(a.heure ?? "").trim() === String(selectedTrip.heure ?? "").trim();
      const statusOk = a.status === "planned" || a.status === "validated";
      return sameTrip && sameHeure && statusOk;
    });
    if (!match) return null;
    return {
      id: match.id,
      vehicleId: String(match.vehicleId ?? "").trim(),
      status: (match.status === "validated" ? "validated" : "planned") as "planned" | "validated",
      driverName: String((match as any).driverName ?? "").trim(),
      convoyeurName: String((match as any).convoyeurName ?? "").trim(),
      driverPhone: String((match as any).driverPhone ?? "").trim(),
      convoyeurPhone: String((match as any).convoyeurPhone ?? "").trim(),
      vehiclePlate: String((match as any).vehiclePlate ?? "").trim(),
      vehicleModel: String((match as any).vehicleModel ?? "").trim(),
    };
  }, [selectedTrip, dayAssignments]);
  const hasOperationalAssignment = !!(activeBoardingAssignment || fallbackBoardingAssignment);

  useEffect(() => {
    if (activeBoardingAssignment || !fallbackBoardingAssignment) return;
    setActiveBoardingAssignment(fallbackBoardingAssignment);
  }, [activeBoardingAssignment, fallbackBoardingAssignment]);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Scan caméra
  const [scanOn, setScanOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScanRef = useRef<number>(0);
  const lastAlertRef = useRef<number>(0);
  const offlineScannedIds = useRef<Set<string>>(new Set());
  /** Snapshot créneau (Phase 3.5) — offline : vérité pour scan / file d’attente. */
  const boardingSlotSnapshotRef = useRef<BoardingSlotSnapshotV1 | null>(null);
  /** Assignment effectif pour contrôles embarquement (offline → snapshot uniquement). */
  const effectiveBoardingAssignmentRef = useRef<{
    id: string;
    vehicleId: string;
    status: "planned" | "validated";
  } | null>(null);
  /** Verrou Firestore tenu par cette instance (libération au changement de créneau / clôture). */
  const lockHeldRef = useRef<{ companyId: string; agencyId: string; assignmentId: string; clientId: string } | null>(
    null
  );
  const lockPermissionDeniedRef = useRef<Set<string>>(new Set());
  const activeAssignmentIdRef = useRef<string | null>(null);
  activeAssignmentIdRef.current = activeBoardingAssignment?.id ?? null;
  /** Évite de réimposer le snapshot local après que l’utilisateur ait désélectionné le créneau (hors ligne). */
  const offlineHydratedKeyRef = useRef<string>("");

  // Online status for offline boarding queue
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" && navigator.onLine);
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  /** Phase 3.5 — assignment effectif : hors ligne = snapshot local uniquement. */
  useEffect(() => {
    if (
      !isOnline &&
      boardingSlotSnapshotRef.current &&
      companyId &&
      selectedAgencyId &&
      boardingSlotSnapshotRef.current.companyId === companyId &&
      boardingSlotSnapshotRef.current.agencyId === selectedAgencyId
    ) {
      const s = boardingSlotSnapshotRef.current;
      effectiveBoardingAssignmentRef.current = {
        id: s.assignmentId,
        vehicleId: s.vehicleId,
        status: s.assignmentStatus,
      };
      return;
    }
    effectiveBoardingAssignmentRef.current = activeBoardingAssignment;
  }, [isOnline, activeBoardingAssignment, companyId, selectedAgencyId]);

  /** Phase 3.5 — capacité véhicule depuis snapshot si hors ligne. */
  useEffect(() => {
    if (!isOnline && boardingSlotSnapshotRef.current?.vehicleCapacity != null) {
      setResolvedVehicleCapacity(boardingSlotSnapshotRef.current.vehicleCapacity ?? null);
    }
  }, [isOnline]);

  /** Phase 3.5 — changement date/agence : libérer verrou et réinitialiser créneau. */
  const dateAgencyKeyRef = useRef<string>("");
  useEffect(() => {
    if (!companyId) return;
    const navState = location.state as
      | { agencyId?: string; date?: string; assignmentId?: string; vehicleId?: string }
      | undefined;
    const keepAssignmentFromNavState =
      !!navState?.assignmentId &&
      !!navState?.vehicleId &&
      navState?.agencyId === (selectedAgencyId ?? undefined) &&
      navState?.date === selectedDate;
    const key = `${selectedDate}|${selectedAgencyId ?? ""}`;
    const prevKey = dateAgencyKeyRef.current;
    if (!prevKey) {
      dateAgencyKeyRef.current = key;
      return;
    }
    if (prevKey === key) return;
    if (keepAssignmentFromNavState) {
      dateAgencyKeyRef.current = key;
      return;
    }
    const pipeIdx = prevKey.indexOf("|");
    const oldAgencyOnly = pipeIdx >= 0 ? prevKey.slice(pipeIdx + 1) : "";
    dateAgencyKeyRef.current = key;
    const held = lockHeldRef.current;
    if (held && isOnline) {
      void closeBoardingSessionLock(held.companyId, held.agencyId, held.assignmentId, held.clientId).catch(() => {});
      lockHeldRef.current = null;
    }
    setActiveBoardingAssignment(null);
    boardingSlotSnapshotRef.current = null;
    offlineHydratedKeyRef.current = "";
    if (oldAgencyOnly) clearBoardingSlotSnapshot(companyId, oldAgencyOnly);
  }, [selectedDate, selectedAgencyId, companyId, isOnline, location.state]);

  /** Phase 3.5 — reprise hors ligne : une restauration auto par (agence, date, assignment) tant que le snapshot existe. */
  useEffect(() => {
    if (isOnline || !companyId || !selectedAgencyId) {
      offlineHydratedKeyRef.current = "";
      return;
    }
    const snap = loadBoardingSlotSnapshot(companyId, selectedAgencyId);
    if (!snap || snap.date !== selectedDate) {
      offlineHydratedKeyRef.current = "";
      return;
    }
    const hk = `${companyId}|${selectedAgencyId}|${snap.date}|${snap.assignmentId}`;
    if (offlineHydratedKeyRef.current === hk) return;
    offlineHydratedKeyRef.current = hk;
    boardingSlotSnapshotRef.current = snap;
    setActiveBoardingAssignment({
      id: snap.assignmentId,
      vehicleId: snap.vehicleId,
      status: snap.assignmentStatus,
    });
    setSelectedTrip((prev) => {
      if (prev) return prev;
      return {
        id: snap.tripId || undefined,
        departure: snap.departure ?? "",
        arrival: snap.arrival ?? "",
        heure: snap.heure,
      };
    });
  }, [isOnline, companyId, selectedAgencyId, selectedDate]);

  /** Phase 3.5 — verrou Firestore + snapshot persistant (en ligne). */
  useEffect(() => {
    if (!isOnline || !companyId || !selectedAgencyId || !uid || !activeBoardingAssignment?.id || !selectedTrip?.heure) {
      return;
    }
    const targetAssignmentId = activeBoardingAssignment.id;
    const targetVehicleId = activeBoardingAssignment.vehicleId;
    const targetStatus = activeBoardingAssignment.status;
    const clientId = getOrCreateBoardingClientInstanceId();
    if (lockHeldRef.current?.assignmentId === targetAssignmentId) return;
    if (lockPermissionDeniedRef.current.has(targetAssignmentId)) return;
    let cancelled = false;

    void (async () => {
      try {
        let lockGranted = false;
        try {
          await startBoardingSessionLock(companyId, selectedAgencyId, targetAssignmentId, uid, clientId);
          lockGranted = true;
        } catch (e: unknown) {
          const msg = String((e as Error)?.message ?? e);
          const m = msg.toLowerCase();
          const permissionDenied =
            m.includes("missing or insufficient permissions") || m.includes("permission_denied");
          if (msg.includes(BOARDING_SESSION_IN_USE_MSG)) {
            throw e;
          }
          if (!permissionDenied) {
            throw e;
          }
          // Degraded mode: continue without Firestore lock when rules reject the lock write.
          lockPermissionDeniedRef.current.add(targetAssignmentId);
          console.warn("[AgenceEmbarquementPage] lock skipped due to rules permissions:", msg);
        }
        // Crée / upsert l’exécution de trajet au début de l’embarquement.
        // On le fait après le verrou boardingSession pour limiter les créations concurrentes.
        if (selectedTrip?.id) {
          try {
            await ensureTripExecutionOnBoardingStart({
              companyId,
              tripAssignmentId: targetAssignmentId,
              vehicleId: targetVehicleId,
              departureAgencyId: selectedAgencyId,
              departureCity: selectedTrip.departure,
              weeklyTripId: selectedTrip.id,
              tripExecutionDate: selectedDate,
              departureTime: selectedTrip.heure,
              targetArrivalCity: selectedTrip.arrival,
            });
          } catch (teErr: unknown) {
            const teMsg = String((teErr as Error)?.message ?? teErr).toLowerCase();
            const tePermissionDenied =
              teMsg.includes("missing or insufficient permissions") || teMsg.includes("permission_denied");
            // Do not block boarding flow if tripExecution upsert is denied by rules.
            if (!tePermissionDenied) throw teErr;
            console.warn("[AgenceEmbarquementPage] tripExecution skipped due to rules permissions:", teErr);
          }
        }
        if (cancelled || activeAssignmentIdRef.current !== targetAssignmentId) return;
        const cap = await getVehicleCapacity(companyId, targetVehicleId);
        if (cancelled || activeAssignmentIdRef.current !== targetAssignmentId) return;
        const snap: BoardingSlotSnapshotV1 = {
          v: 1,
          companyId,
          agencyId: selectedAgencyId,
          assignmentId: targetAssignmentId,
          vehicleId: targetVehicleId,
          tripId: selectedTrip.id ?? "",
          departure: selectedTrip.departure,
          arrival: selectedTrip.arrival,
          date: selectedDate,
          heure: selectedTrip.heure,
          assignmentStatus: targetStatus,
          clientInstanceId: clientId,
          savedAt: Date.now(),
          vehicleCapacity: cap,
        };
        persistBoardingSlotSnapshot(snap);
        boardingSlotSnapshotRef.current = snap;
        lockHeldRef.current = lockGranted
          ? {
              companyId,
              agencyId: selectedAgencyId,
              assignmentId: targetAssignmentId,
              clientId,
            }
          : null;
      } catch (e: unknown) {
        const msg = String((e as Error)?.message ?? e);
        const m = msg.toLowerCase();
        const permissionDenied =
          m.includes("missing or insufficient permissions") || m.includes("permission_denied");
        if (cancelled || activeAssignmentIdRef.current !== targetAssignmentId) return;
        if (permissionDenied) {
          // Degraded mode: keep selected assignment and continue without lock/capacity snapshot.
          console.warn("[AgenceEmbarquementPage] degraded mode on permission error:", msg);
          lockHeldRef.current = null;
          return;
        }
        if (msg.includes(BOARDING_SESSION_IN_USE_MSG)) {
          alert(BOARDING_SESSION_IN_USE_MSG);
        } else {
          alert(msg || "Impossible de démarrer la session d’embarquement.");
        }
        setActiveBoardingAssignment(null);
        boardingSlotSnapshotRef.current = null;
        clearBoardingSlotSnapshot(companyId, selectedAgencyId);
        lockHeldRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isOnline,
    companyId,
    selectedAgencyId,
    uid,
    activeBoardingAssignment?.id,
    activeBoardingAssignment?.vehicleId,
    activeBoardingAssignment?.status,
    selectedTrip?.id,
    selectedTrip?.heure,
    selectedDate,
  ]);

  /** Phase 3.5 — fermeture onglet : libérer le verrou. */
  useEffect(() => {
    const onPageHide = () => {
      const held = lockHeldRef.current;
      if (!held) return;
      void closeBoardingSessionLock(held.companyId, held.agencyId, held.assignmentId, held.clientId);
      lockHeldRef.current = null;
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Fast boarding overlay (success / error for 1.2s; success can show "Embarqué (hors ligne)" + détail passager + alerte dépassement)
  type ScanDetails = {
    nomClient?: string;
    depart?: string;
    arrivee?: string;
    statutEmbarquement?: string;
    overtravel?: boolean;
  };
  const [fastBoardOverlay, setFastBoardOverlay] = useState<
    { type: "success"; offline?: boolean; scanDetails?: ScanDetails } | { type: "error"; message: string } | null
  >(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFastBoardSuccess = useCallback((offline?: boolean, scanDetails?: ScanDetails) => {
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    setFastBoardOverlay({ type: "success", offline: !!offline, scanDetails: scanDetails ?? undefined });
    try { navigator.vibrate(120); } catch {}
    try { new Audio("/beep.mp3").play(); } catch {}
    overlayTimeoutRef.current = setTimeout(() => {
      overlayTimeoutRef.current = null;
      setFastBoardOverlay(null);
    }, FAST_BOARDING_OVERLAY_DURATION_MS);
  }, []);

  const showFastBoardError = useCallback((message: string) => {
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    setFastBoardOverlay({ type: "error", message });
    try { navigator.vibrate([100, 50, 100]); } catch {}
    overlayTimeoutRef.current = setTimeout(() => {
      overlayTimeoutRef.current = null;
      setFastBoardOverlay(null);
    }, FAST_BOARDING_OVERLAY_DURATION_MS);
  }, []);

  const normalizeOverlayMessage = useCallback((msg: string): string => {
    if (msg.includes("Déjà embarqué")) return "Déjà embarqué";
    if (msg.includes("Capacité véhicule atteinte") || msg.includes("Capacité atteinte")) return "Capacité atteinte";
    if (msg.includes("non concordants") || msg.includes("autre départ")) return "Billet pour un autre trajet";
    if (msg.includes("non valide")) return "Billet non valide";
    return msg || "Erreur d'embarquement";
  }, []);

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    };
  }, []);

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

  /* ---------- Capacité depuis tripAssignment.vehicleId si non fournie par le parent ---------- */
  useEffect(() => {
    if (vehicleCapacity != null) {
      setResolvedVehicleCapacity(null);
      return;
    }
    const effectiveVehicleId =
      String(activeBoardingAssignment?.vehicleId ?? "").trim() ||
      String(fallbackBoardingAssignment?.vehicleId ?? "").trim();
    if (!companyId || !effectiveVehicleId) {
      setResolvedVehicleCapacity(null);
      return;
    }
    let cancelled = false;
    getVehicleCapacity(companyId, effectiveVehicleId).then((c) => {
      if (!cancelled) setResolvedVehicleCapacity(c);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicleCapacity, companyId, activeBoardingAssignment?.vehicleId, fallbackBoardingAssignment?.vehicleId]);

  /* ---------- Véhicule : plaque depuis flotte (tripAssignment) + équipage affectation si dispo ---------- */
  useEffect(() => {
    setAssign({});
    if (!companyId || !selectedAgencyId || !selectedTrip || !selectedDate) return;
    const dep = (selectedTrip.departure ?? "").trim();
    const arr = (selectedTrip.arrival ?? "").trim();
    const heure = (selectedTrip.heure ?? "").trim();
    if (!dep || !arr) return;
    let cancelled = false;
    (async () => {
      let immat = "";
      let bus = "";
      let chauffeur = "";
      let chauffeurPhone = "";
      let chef = "";
      let chefPhone = "";
      let assignmentIdFromExecution = "";
      const tripExecutionId = selectedTrip.id
        ? buildTripExecutionIdFromSlot({
            weeklyTripId: selectedTrip.id,
            tripExecutionDate: selectedDate,
            departureTime: heure,
          })
        : "";

      if (tripExecutionId) {
        try {
          const teSnap = await getDoc(tripExecutionRef(companyId, tripExecutionId));
          if (teSnap.exists()) {
            const te = teSnap.data() as {
              tripAssignmentId?: string;
              vehicleSnapshot?: { plateNumber?: string; driverName?: string; convoyeurName?: string };
            };
            assignmentIdFromExecution = String(te.tripAssignmentId ?? "").trim();
            immat = String(te.vehicleSnapshot?.plateNumber ?? "").trim() || immat;
            chauffeur = String(te.vehicleSnapshot?.driverName ?? "").trim() || chauffeur;
            chef = String(te.vehicleSnapshot?.convoyeurName ?? "").trim() || chef;
          }
        } catch {
          /* ignore */
        }
      }

      let assignmentId =
        assignmentIdFromExecution ||
        String(activeBoardingAssignment?.id ?? "").trim() ||
        String(fallbackBoardingAssignment?.id ?? "").trim() ||
        String(selectedTripAssignment?.id ?? "").trim();
      if (!assignmentId && selectedTrip?.id) {
        assignmentId = tripAssignmentDocId(selectedTrip.id, selectedDate, heure);
      }
      if (assignmentId) {
        try {
          const asgSnap = await getDoc(
            doc(db, "companies", companyId, "agences", selectedAgencyId, "tripAssignments", assignmentId)
          );
          if (asgSnap.exists() && !cancelled) {
            const ad = asgSnap.data() as {
              vehicleId?: string;
              driverName?: string;
              convoyeurName?: string;
              driverPhone?: string;
              convoyeurPhone?: string;
            };
            chauffeur = String(ad.driverName ?? "").trim() || chauffeur;
            chef = String(ad.convoyeurName ?? "").trim() || chef;
            chauffeurPhone = String(ad.driverPhone ?? "").trim() || chauffeurPhone;
            chefPhone = String(ad.convoyeurPhone ?? "").trim() || chefPhone;
            immat =
              String((ad as any).vehiclePlate ?? "").trim() ||
              String((ad as any).plateNumber ?? "").trim() ||
              String((ad as any).vehicleImmat ?? "").trim() ||
              immat;
            bus = String((ad as any).vehicleModel ?? "").trim() || String((ad as any).busLabel ?? "").trim() || bus;
            if (!immat && ad.vehicleId) {
              const vs2 = await getDoc(vehicleRef(companyId, String(ad.vehicleId).trim()));
              if (vs2.exists() && !cancelled) {
                const vd2 = vs2.data() as { plateNumber?: string; model?: string };
                immat = String(vd2.plateNumber ?? "").trim() || immat;
                bus = String(vd2.model ?? "").trim() || bus;
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
      const effectiveVehicleId =
        String(activeBoardingAssignment?.vehicleId ?? "").trim() ||
        String(fallbackBoardingAssignment?.vehicleId ?? "").trim() ||
        String(selectedTripAssignment?.vehicleId ?? "").trim();
      chauffeur = chauffeur || String(selectedTripAssignment?.driverName ?? "").trim();
      chef = chef || String(selectedTripAssignment?.convoyeurName ?? "").trim();
      chauffeurPhone = chauffeurPhone || String(selectedTripAssignment?.driverPhone ?? "").trim();
      chefPhone = chefPhone || String(selectedTripAssignment?.convoyeurPhone ?? "").trim();
      immat = immat || String(selectedTripAssignment?.vehiclePlate ?? "").trim();
      bus = bus || String(selectedTripAssignment?.vehicleModel ?? "").trim();
      if (!immat && effectiveVehicleId) {
        immat = effectiveVehicleId;
      }
      if (effectiveVehicleId) {
        try {
          const crewSnap = await getDocs(
            query(collection(db, `companies/${companyId}/personnel`), where("assignedVehicleId", "==", effectiveVehicleId))
          );
          if (!cancelled && !crewSnap.empty) {
            const toFullName = (d: Record<string, unknown>) => {
              const last = String(d.lastName ?? "").trim();
              const first = String(d.firstName ?? "").trim();
              const full = String(d.fullName ?? "").trim();
              return [last, first].filter(Boolean).join(" ").trim() || full;
            };
            const drivers = crewSnap.docs
              .map((x) => x.data() as Record<string, unknown>)
              .filter((d) => {
                const role = String(d.crewRole ?? d.role ?? "").trim().toLowerCase();
                return d.active !== false && d.isAvailable !== false && (role === "driver" || role === "both");
              });
            const convoyeurs = crewSnap.docs
              .map((x) => x.data() as Record<string, unknown>)
              .filter((d) => {
                const role = String(d.crewRole ?? d.role ?? "").trim().toLowerCase();
                return d.active !== false && d.isAvailable !== false && (role === "convoyeur" || role === "both");
              });
            const d0 = drivers[0];
            const c0 = convoyeurs[0];
            if (d0) {
              chauffeur = chauffeur || toFullName(d0);
              chauffeurPhone = chauffeurPhone || String(d0.phone ?? "").trim();
            }
            if (c0) {
              chef = chef || toFullName(c0);
              chefPhone = chefPhone || String(c0.phone ?? "").trim();
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (effectiveVehicleId) {
        try {
          const vs = await getDoc(vehicleRef(companyId, effectiveVehicleId));
          if (vs.exists() && !cancelled) {
            const vd = vs.data() as { plateNumber?: string; model?: string };
            immat = String(vd.plateNumber ?? "");
            bus = String(vd.model ?? "");
          }
        } catch {
          /* ignore */
        }
      }
      const a = await getAffectationForBoarding(companyId, selectedAgencyId, dep, arr, selectedDate, heure).catch(
        () => null
      );
      if (cancelled) return;
      if (a || immat || bus || chauffeur || chef) {
        setAssign({
          bus: bus || ((a as any)?.vehicleModel ?? ""),
          immat: immat || ((a as any)?.vehiclePlate ?? ""),
          chauffeur: chauffeur || ((a as any)?.driverName ?? ""),
          chauffeurPhone: chauffeurPhone || ((a as any)?.driverPhone ?? ""),
          chef: chef || ((a as any)?.convoyeurName ?? ""),
          chefPhone: chefPhone || ((a as any)?.convoyeurPhone ?? ""),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    selectedAgencyId,
    selectedTrip,
    selectedDate,
    activeBoardingAssignment?.id,
    activeBoardingAssignment?.vehicleId,
    fallbackBoardingAssignment?.id,
    fallbackBoardingAssignment?.vehicleId,
    selectedTripAssignment?.id,
    selectedTripAssignment?.vehicleId,
    selectedTripAssignment?.driverName,
    selectedTripAssignment?.convoyeurName,
    selectedTripAssignment?.driverPhone,
    selectedTripAssignment?.convoyeurPhone,
    selectedTripAssignment?.vehiclePlate,
    selectedTripAssignment?.vehicleModel,
  ]);

  /* ---------- Pré-remplissage navigation (boarding/scan : tripAssignment obligatoire) ---------- */
  useEffect(() => {
    const st = location.state;
    if (st?.agencyId) setSelectedAgencyId(st.agencyId);
    if (st?.assignmentId && st?.vehicleId) {
      setActiveBoardingAssignment({
        id: String(st.assignmentId),
        vehicleId: String(st.vehicleId),
        status: st.assignmentStatus === "planned" ? "planned" : "validated",
      });
    }
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

  /* ---------- Grille du jour : weeklyTrips + tripAssignments (source vérité véhicule) ---------- */
  useEffect(() => {
    const load = async () => {
      if (!companyId || !selectedAgencyId) {
        setWeeklyForDay([]);
        setDayAssignments([]);
        return;
      }

      const weeklyTripsRef = collection(db, `companies/${companyId}/agences/${selectedAgencyId}/weeklyTrips`);
      const [snap, assignments] = await Promise.all([
        getDocs(weeklyTripsRef),
        listBoardingTripAssignmentsForDate(companyId, selectedAgencyId, selectedDate),
      ]);

      const dayName = weekdayFR(new Date(selectedDate));
      const trips = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }) as WeeklyTrip)
        .filter((t) => t.active && t.horaires?.[dayName]?.length > 0);

      setWeeklyForDay(trips);
      setDayAssignments(assignments);

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
  }, [companyId, selectedAgencyId, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Écoute temps réel réservations (inclut EMBARQUÉ/ABSENT) ---------- */
  /* When scanOn is true, skip listener to improve scan performance (< 500ms goal). */
  useEffect(() => {
    if (scanOn) return;
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
      setReservations(list.filter((r) => String(r.statut ?? "").toLowerCase() !== INVALID_RESERVATION_STATUT));
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
  }, [companyId, selectedAgencyId, selectedTrip, selectedDate, scanOn]);

  /* ---------- Mise à jour Embarqué / Absent (verrou + concordance) ---------- */
  const updateStatut = useCallback(
    async (
      reservationId: string,
      statut: StatutEmbarquement,
      agencyOverride?: string,
      options?: { suppressAlert?: boolean }
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
      if (statut === "embarqué" && !effectiveBoardingAssignmentRef.current) {
        alert("Ce trajet n’a pas encore de véhicule assigné.");
        return;
      }

      const resRef = doc(
        db,
        `companies/${companyId}/agences/${agencyIdToUse}/reservations/${reservationId}`
      );

      // Phase 3: capacity check before transaction (tx.get() does not support queries)
      if (statut === "embarqué" && capacityLimit != null && capacityLimit > 0) {
        const qEmb = query(
          collection(db, `companies/${companyId}/agences/${agencyIdToUse}/reservations`),
          where("date", "==", selectedDate),
          where("heure", "==", selectedTrip!.heure)
        );
        const snapEmb = await getDocs(qEmb);
        let seatsEmbarques = 0;
        snapEmb.docs.forEach((d) => {
          const docData = d.data() as { trajetId?: string; depart?: string; arrivee?: string; arrival?: string; seatsGo?: number; boardingStatus?: string; statutEmbarquement?: string };
          if (docData.trajetId === selectedTrip?.id || (normCity(docData.depart) === normCity(selectedTrip!.departure) && normCity(docData.arrivee || docData.arrival) === normCity(selectedTrip!.arrival))) {
            if (getEffectiveBoardingStatus(docData) === "boarded") seatsEmbarques += docData.seatsGo ?? 1;
          }
        });
        const resSnap = await getDoc(resRef);
        const dataPre = resSnap.exists() ? (resSnap.data() as { boardingStatus?: string; statutEmbarquement?: string; seatsGo?: number }) : null;
        const alreadyEmbarked = dataPre ? getEffectiveBoardingStatus(dataPre) === "boarded" : false;
        const addSeats = alreadyEmbarked ? 0 : (dataPre?.seatsGo ?? 1);
        if (seatsEmbarques + addSeats > capacityLimit) {
          throw new Error("Capacité véhicule atteinte");
        }
      }

      // Arrivée auto à l'escale si embarquement depuis une escale (avant action passager)
      if (statut === "embarqué" && (agencyInfo as { type?: string; stopOrder?: number })?.type === "escale") {
        const stopOrder = (agencyInfo as { stopOrder?: number }).stopOrder;
        if (stopOrder != null && companyId) {
          const resSnap = await getDoc(resRef);
          const resData = resSnap.exists() ? (resSnap.data() as { tripInstanceId?: string; trajetId?: string }) : {};
          const tripInstanceId = resData.tripInstanceId ?? resData.trajetId ?? selectedTrip?.id;
          if (tripInstanceId) await ensureProgressArrival(companyId, tripInstanceId, stopOrder);
        }
      }

      let prefetchedLiveExpected: number | null = null;
      if (statut === "embarqué" && companyId && agencyIdToUse) {
        const aidPre = effectiveBoardingAssignmentRef.current?.id;
        if (aidPre) {
          try {
            const asrefPre = doc(
              db,
              `companies/${companyId}/agences/${agencyIdToUse}/tripAssignments/${aidPre}`
            );
            const asnapPre = await getDoc(asrefPre);
            if (asnapPre.exists()) {
              const ldPre = asnapPre.data() as TripAssignmentDoc;
              if (ldPre.liveStatus?.boardingStartedAt == null) {
                prefetchedLiveExpected = await countExpectedReservationsForTripSlot(
                  companyId,
                  agencyIdToUse,
                  {
                    tripId: ldPre.tripId,
                    date: ldPre.date,
                    heure: String(ldPre.heure ?? "").trim(),
                  }
                );
              }
            }
          } catch {
            /* recalcul optionnel */
          }
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

          const lockRef = doc(
            db,
            `companies/${companyId}/agences/${agencyIdToUse}/boardingLocks/${reservationId}`
          );
          const lockSnap = await tx.get(lockRef);

          // Phase 4.5 — embarqué : ordre verrou / dédup → stats / live (évite double comptage)
          if (statut === "embarqué") {
            const addSeats =
              getEffectiveBoardingStatus(data as { boardingStatus?: string; statutEmbarquement?: string }) ===
              "boarded"
                ? 0
                : Number(data.seatsGo) || 1;
            if (addSeats === 0) {
              throw new Error("Déjà embarqué");
            }
            if (lockSnap.exists()) {
              throw new Error("Déjà embarqué");
            }

            const liveAid = effectiveBoardingAssignmentRef.current?.id;
            let embarkDedupRef: ReturnType<typeof boardingEmbarkDedupDocRef> | null = null;
            if (liveAid) {
              embarkDedupRef = boardingEmbarkDedupDocRef(
                companyId,
                agencyIdToUse,
                liveAid,
                reservationId
              );
              const dedupSnap = await tx.get(embarkDedupRef);
              if (dedupSnap.exists()) {
                throw new Error("Déjà embarqué");
              }
            }
            let liveAsgRef = null as ReturnType<typeof doc> | null;
            let liveAsg: TripAssignmentDoc | null = null;
            if (liveAid) {
              liveAsgRef = doc(
                db,
                `companies/${companyId}/agences/${agencyIdToUse}/tripAssignments/${liveAid}`
              );
              const asgSnap = await tx.get(liveAsgRef);
              if (asgSnap.exists()) {
                liveAsg = asgSnap.data() as TripAssignmentDoc;
              }
            }

            const tripKey = boardingStatsKey(selDep ?? "", selArr ?? "", selHr ?? "", selectedDate);
            const statsRef = getBoardingStatsRef(companyId, agencyIdToUse, tripKey);
            const statsSnap = await tx.get(statsRef);
            if (!statsSnap.exists()) {
              createBoardingStats(tx, companyId, agencyIdToUse, tripKey, {
                tripId: selectedTrip?.id ?? (data.trajetId as string | null) ?? null,
                date: selectedDate,
                heure: (selectedTrip?.heure ?? data.heure ?? "") as string,
                vehicleCapacity: capacityLimit ?? 0,
              });
              updateAgencyLiveStateOnBoardingOpened(tx, companyId, agencyIdToUse);
            }
            const currentEmbarked = statsSnap.exists()
              ? ((statsSnap.data() as { embarkedSeats?: number }).embarkedSeats ?? 0)
              : 0;
            if (vehicleCapacity != null && vehicleCapacity > 0 && currentEmbarked + addSeats > vehicleCapacity) {
              throw new Error("Capacité véhicule atteinte");
            }
            incrementBoardingStatsEmbarked(tx, companyId, agencyIdToUse, tripKey, addSeats);

            if (liveAsgRef && liveAsg && (liveAsg.status === "planned" || liveAsg.status === "validated")) {
              const ls = liveAsg.liveStatus;
              const prevBoarded = ls?.boardedCount ?? 0;
              const isFirstEmbark = ls?.boardingStartedAt == null;
              const expected =
                isFirstEmbark && prefetchedLiveExpected != null
                  ? prefetchedLiveExpected
                  : (ls?.expectedCount ?? 0);
              const nextBoarded = prevBoarded + addSeats;
              const startedAt =
                ls?.boardingStartedAt != null ? ls.boardingStartedAt : serverTimestamp();
              tx.update(liveAsgRef, {
                liveStatus: {
                  boardedCount: nextBoarded,
                  expectedCount: expected,
                  status: "boarding",
                  boardingStartedAt: startedAt,
                },
                updatedAt: serverTimestamp(),
              });
            }

            if (embarkDedupRef) {
              tx.set(embarkDedupRef, {
                reservationId,
                tripAssignmentId: liveAid,
                scannedAt: serverTimestamp(),
              });
            }

            tx.set(lockRef, {
              reservationId,
              by: uid,
              at: serverTimestamp(),
              tripId: selectedTrip?.id ?? data.trajetId ?? null,
              date: selectedDate,
              heure: selectedTrip?.heure ?? data.heure ?? null,
            });
          }

          const patch: Record<string, unknown> = {
            boardingStatus: statut === "embarqué" ? "boarded" : statut === "absent" ? "no_show" : "pending",
            controleurId: uid,
            checkInTime: statut === "embarqué" ? serverTimestamp() : null,
          };
          if (statut === "embarqué") {
            (patch as any).journeyStatus = "in_transit";
            (patch as any).statut = "embarque";
            (patch as any).auditLog = arrayUnion(
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

        if (statut === "embarqué") {
          logAgentHistoryEvent({
            companyId,
            agencyId: agencyIdToUse,
            agentId: uid,
            agentName: (user as { displayName?: string | null })?.displayName ?? null,
            role: String((user as { role?: string })?.role ?? "agency_boarding_officer"),
            type: "BOARDING_SCANNED",
            referenceId: reservationId,
            status: "VALIDE",
            createdBy: uid,
            metadata: {
              tripId: selectedTrip?.id ?? null,
              date: selectedDate,
              heure: selectedTrip?.heure ?? null,
            },
          });
        }

        if (!options?.suppressAlert) {
          try { new Audio("/beep.mp3").play(); } catch {}
        }
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        const permissionDenied =
          msg.toLowerCase().includes("missing or insufficient permissions") ||
          msg.toLowerCase().includes("permission_denied");
        if (permissionDenied) {
          try {
            // Fallback prod: write only fields accepted by strict boarding rules.
            const current = await getDoc(resRef);
            const currentStatut = current.exists() ? String((current.data() as Record<string, unknown>).statut ?? "") : "";
            const nextStatut = statut === "embarqué" ? "embarque" : currentStatut;
            await updateDoc(resRef, {
              statutEmbarquement: statut,
              ...(statut === "embarqué" ? { statut: nextStatut } : {}),
              controleurId: uid,
              checkInTime: statut === "embarqué" ? serverTimestamp() : null,
              auditLog: arrayUnion(
                buildStatutTransitionPayload(currentStatut, nextStatut || currentStatut, {
                  userId: uid,
                  userRole: (user as { role?: string })?.role ?? "controleur_embarquement",
                })
              ),
              updatedAt: serverTimestamp(),
            } as Record<string, unknown>);
            if (!options?.suppressAlert) {
              try {
                new Audio("/beep.mp3").play();
              } catch {
                /* ignore */
              }
            }
            return;
          } catch (fallbackErr) {
            console.error("[EMBARK][FALLBACK][ERROR]", fallbackErr);
          }
        }
        if (options?.suppressAlert) {
          console.error("[EMBARK][ERROR]", e);
          throw e;
        }
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
    [
      companyId,
      selectedAgencyId,
      uid,
      user,
      selectedTrip?.id,
      selectedTrip?.departure,
      selectedTrip?.arrival,
      selectedTrip?.heure,
      selectedDate,
      capacityLimit,
      agencyInfo,
    ]
  );

  /* ---------- Sync offline boarding queue when connection returns ---------- */
  useEffect(() => {
    if (!isOnline || !companyId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const list = await getUnsyncedBoardingQueue();
        for (const rec of list) {
          if (cancelled) break;
          const prevEff = effectiveBoardingAssignmentRef.current;
          try {
            if (rec.assignmentId && rec.vehicleId) {
              effectiveBoardingAssignmentRef.current = {
                id: rec.assignmentId,
                vehicleId: rec.vehicleId,
                status: rec.assignmentStatus === "planned" ? "planned" : "validated",
              };
            }
            await updateStatut(rec.reservationId, "embarqué", rec.agencyId, { suppressAlert: true });
            if (rec.id != null) await markBoardingQueueSynced(rec.id);
          } catch (e: unknown) {
            const msg = String((e as { message?: string })?.message ?? e ?? "");
            if (msg.includes("Déjà embarqué") && rec.id != null) {
              await markBoardingQueueSynced(rec.id);
            }
          } finally {
            effectiveBoardingAssignmentRef.current = prevEff;
          }
        }
      } catch (err) {
        console.error("[EMBARK][SYNC]", err);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [isOnline, companyId, updateStatut]);

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
        boardingStatus: "no_show",
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
        boardingStatus: "pending",
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
  const [tripInstanceIdForSlot, setTripInstanceIdForSlot] = useState<string | null>(null);
  const [originDepartureDone, setOriginDepartureDone] = useState(false);
  const [sendingOriginDeparture, setSendingOriginDeparture] = useState(false);

  useEffect(() => {
    if (!companyId || !selectedAgencyId || !tripKey) { setIsClosed(false); return; }
    const ref = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/boardingClosures/${tripKey}`);
    const unsub = onSnapshot(ref, (s) => setIsClosed(s.exists()));
    return () => unsub();
  }, [companyId, selectedAgencyId, tripKey]);

  /* ---------- Résoudre tripInstanceId + auto-départ 30 min après clôture ---------- */
  useEffect(() => {
    if (!companyId || !selectedAgencyId || !selectedTrip || !selectedDate || !isClosed) {
      setTripInstanceIdForSlot(null);
      setOriginDepartureDone(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const closureRef = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/boardingClosures/${tripKey!}`);
        const closureSnap = await getDoc(closureRef);
        const closedAt = closureSnap.exists() ? (closureSnap.data() as { closedAt?: { toMillis: () => number } }).closedAt : null;
        const ti = await findTripInstanceBySlot(
          companyId,
          selectedAgencyId,
          selectedDate,
          selectedTrip.heure,
          selectedTrip.departure,
          selectedTrip.arrival
        );
        if (cancelled || !ti) {
          setTripInstanceIdForSlot(null);
          setOriginDepartureDone(false);
          return;
        }
        setTripInstanceIdForSlot(ti.id);
        if (closedAt && typeof (closedAt as any).toMillis === "function") await ensureAutoDepartIfNeeded(companyId, ti.id, closedAt as any);
        const progress = await getTripProgress(companyId, ti.id);
        const origin = progress.find((p) => p.stopOrder === ORIGIN_STOP_ORDER);
        setOriginDepartureDone(!!origin?.departureTime);
      } catch {
        if (!cancelled) setTripInstanceIdForSlot(null);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, selectedAgencyId, selectedTrip, selectedDate, isClosed, tripKey]);

  const handleBusParti = useCallback(async () => {
    if (!companyId || !tripInstanceIdForSlot || !uid) return;
    setSendingOriginDeparture(true);
    try {
      await markOriginDeparture(companyId, tripInstanceIdForSlot, uid);
      setOriginDepartureDone(true);
    } catch (e) {
      console.error("[Embarquement] markOriginDeparture error:", e);
      alert(e instanceof Error ? e.message : "Erreur lors de l'enregistrement du départ.");
    } finally {
      setSendingOriginDeparture(false);
    }
  }, [companyId, tripInstanceIdForSlot, uid]);

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
          const embarked = getEffectiveBoardingStatus(r) === "boarded";
          if (!embarked) {
            const resRef = doc(db, `companies/${companyId}/agences/${selectedAgencyId}/reservations/${r.id}`);
            tx.update(resRef, {
              boardingStatus: "no_show",
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
        updateDailyStatsOnBoardingClosed(
          tx,
          companyId,
          selectedAgencyId,
          selectedDate,
          dailyStatsTimezoneFromAgencyData(agencyInfo as { timezone?: string } | undefined)
        );
        const tripKey = boardingStatsKey(selectedTrip.departure, selectedTrip.arrival, selectedTrip.heure, selectedDate);
        const absentSeats = reservations
          .filter((r) => getEffectiveBoardingStatus(r) !== "boarded")
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
        const embarked = getEffectiveBoardingStatus(r) === "boarded";
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
            boardingStatus: "pending",
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

      const held = lockHeldRef.current;
      if (held && isOnline) {
        await closeBoardingSessionLock(held.companyId, held.agencyId, held.assignmentId, held.clientId).catch(() => {});
        lockHeldRef.current = null;
      }
      if (companyId && selectedAgencyId) {
        clearBoardingSlotSnapshot(companyId, selectedAgencyId);
        boardingSlotSnapshotRef.current = null;
      }

      if (activeBoardingAssignment?.id && companyId && selectedAgencyId) {
        try {
          const aref = doc(
            db,
            `companies/${companyId}/agences/${selectedAgencyId}/tripAssignments/${activeBoardingAssignment.id}`
          );
          const asnap = await getDoc(aref);
          if (asnap.exists()) {
            const ad = asnap.data() as TripAssignmentDoc;
            const ls = ad.liveStatus;
            const livePatch: Record<string, unknown> = {
              boardedCount: ls?.boardedCount ?? 0,
              expectedCount: ls?.expectedCount ?? 0,
              status: "completed",
            };
            if (ls?.boardingStartedAt != null) livePatch.boardingStartedAt = ls.boardingStartedAt;
            await updateDoc(aref, {
              liveStatus: livePatch,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          console.warn("[LIVE] mark completed", err);
        }
      }

      alert("Clôture effectuée. Absents marqués et reprogrammés (si possible).");
    } catch (e: any) {
      if (String(e?.message || e) === "DEJA_CLOTURE") {
        alert("Déjà clôturé : aucune action répétée.");
      } else {
        console.error(e);
        alert("Erreur lors de la clôture.");
      }
    }
  }, [
    companyId,
    selectedAgencyId,
    uid,
    selectedTrip,
    selectedDate,
    reservations,
    tripKey,
    agencyInfo,
    isOnline,
    activeBoardingAssignment?.id,
  ]);

  /* ---------- Offline: resolve from cached list (no Firestore) ---------- */
  const findFromCache = useCallback(
    (code: string): { resId: string; agencyId: string } | null => {
      if (!selectedAgencyId) return null;
      const c = (code || "").trim();
      const r = reservations.find(
        (res) => (res.referenceCode || res.id || "").trim() === c
      );
      return r ? { resId: r.id, agencyId: selectedAgencyId } : null;
    },
    [reservations, selectedAgencyId]
  );

  /* ---------- Saisie manuelle ---------- */
  const [scanCode, setScanCode] = useState("");
  const submitManual = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!companyId) return;

      const code = extractCode(scanCode);
      if (!code) return;

      if (!effectiveBoardingAssignmentRef.current) {
        showFastBoardError("Ce trajet n’a pas encore de véhicule assigné.");
        return;
      }

      if (!isOnline) {
        const found = findFromCache(code);
        if (found) {
          if (offlineScannedIds.current.has(found.resId)) {
            showFastBoardError("Billet déjà scanné (hors ligne).");
            return;
          }
          offlineScannedIds.current.add(found.resId);
          const eff = effectiveBoardingAssignmentRef.current;
          await addToBoardingQueue({
            reservationId: found.resId,
            agencyId: found.agencyId,
            companyId,
            tripId: selectedTrip?.id ?? null,
            date: selectedDate ?? "",
            heure: selectedTrip?.heure ?? null,
            assignmentId: eff?.id,
            vehicleId: eff?.vehicleId,
            assignmentStatus: eff?.status,
          });
          showFastBoardSuccess(true);
          setScanCode("");
        } else {
          showFastBoardError("Billet introuvable (hors ligne).");
        }
        return;
      }

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
          let scanDetails: ScanDetails | undefined;
          try {
            const resRef = doc(db, `companies/${companyId}/agences/${found.agencyId}/reservations/${found.resId}`);
            const resSnap = await getDoc(resRef);
            if (resSnap.exists()) {
              const d = resSnap.data() as Record<string, unknown>;
              const destOrder = d.destinationStopOrder != null ? Number(d.destinationStopOrder) : null;
              const currentStopOrder = (agencyInfo as { type?: string; stopOrder?: number } | null)?.type === "escale" ? (agencyInfo as { stopOrder?: number }).stopOrder : undefined;
              const overtravel = currentStopOrder != null && destOrder != null && destOrder < currentStopOrder;
              const eff = getEffectiveBoardingStatus({ boardingStatus: d.boardingStatus as string, statutEmbarquement: d.statutEmbarquement as string });
              scanDetails = {
                nomClient: (d.nomClient as string) ?? undefined,
                depart: (d.depart as string) ?? undefined,
                arrivee: (d.arrivee as string) ?? undefined,
                statutEmbarquement: eff === "boarded" ? "embarqué" : eff === "no_show" ? "absent" : "en_attente",
                overtravel,
              };
            }
          } catch (_) {}
          await updateStatut(found.resId, "embarqué", found.agencyId, { suppressAlert: true });
          showFastBoardSuccess(false, scanDetails);
          setScanCode("");
        } else {
          showFastBoardError("Réservation introuvable.");
        }
      } catch (err: any) {
        console.error(err);
        showFastBoardError(normalizeOverlayMessage(err?.message ?? "Erreur lors de la validation manuelle."));
      }
    },
    [scanCode, companyId, selectedAgencyId, isOnline, findFromCache, updateStatut, selectedTrip, selectedDate, showFastBoardSuccess, showFastBoardError, normalizeOverlayMessage, agencyInfo]
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
              if (!code) return;
              if (!effectiveBoardingAssignmentRef.current) {
                showFastBoardError("Ce trajet n’a pas encore de véhicule assigné.");
                return;
              }
              if (!isOnline) {
                const found = findFromCache(code);
                if (found) {
                  if (offlineScannedIds.current.has(found.resId)) {
                    showFastBoardError("Billet déjà scanné (hors ligne).");
                    return;
                  }
                  offlineScannedIds.current.add(found.resId);
                  const eff = effectiveBoardingAssignmentRef.current;
                  await addToBoardingQueue({
                    reservationId: found.resId,
                    agencyId: found.agencyId,
                    companyId: companyId!,
                    tripId: selectedTrip?.id ?? null,
                    date: selectedDate ?? "",
                    heure: selectedTrip?.heure ?? null,
                    assignmentId: eff?.id,
                    vehicleId: eff?.vehicleId,
                    assignmentStatus: eff?.status,
                  });
                  showFastBoardSuccess(true);
                } else {
                  showFastBoardError("Billet introuvable (hors ligne).");
                }
                return;
              }
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
                let scanDetails: { nomClient?: string; depart?: string; arrivee?: string; statutEmbarquement?: string; overtravel?: boolean } | undefined;
                try {
                  const resRef = doc(db, `companies/${companyId}/agences/${found.agencyId}/reservations/${found.resId}`);
                  const resSnap = await getDoc(resRef);
                  if (resSnap.exists()) {
                    const d = resSnap.data() as Record<string, unknown>;
                    const destOrder = d.destinationStopOrder != null ? Number(d.destinationStopOrder) : null;
                    const currentStopOrder = (agencyInfo as { type?: string; stopOrder?: number } | null)?.type === "escale" ? (agencyInfo as { stopOrder?: number }).stopOrder : undefined;
                    const overtravel = currentStopOrder != null && destOrder != null && destOrder < currentStopOrder;
                    scanDetails = { nomClient: (d.nomClient as string) ?? undefined, depart: (d.depart as string) ?? undefined, arrivee: (d.arrivee as string) ?? undefined, statutEmbarquement: (() => { const e = getEffectiveBoardingStatus({ boardingStatus: d.boardingStatus as string, statutEmbarquement: d.statutEmbarquement as string }); return e === "boarded" ? "embarqué" : e === "no_show" ? "absent" : "en_attente"; })(), overtravel };
                  }
                } catch (_) {}
                await updateStatut(found.resId, "embarqué", found.agencyId, { suppressAlert: true });
                showFastBoardSuccess(false, scanDetails);
              } else {
                showFastBoardError("Billet introuvable.");
              }
            } catch (e: any) {
              console.error(e);
              showFastBoardError(normalizeOverlayMessage(e?.message ?? "Erreur lors du scan"));
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
              if (!code) return;
              if (!effectiveBoardingAssignmentRef.current) {
                showFastBoardError("Ce trajet n’a pas encore de véhicule assigné.");
                return;
              }
              if (!isOnline) {
                const found = findFromCache(code);
                if (found) {
                  if (offlineScannedIds.current.has(found.resId)) {
                    showFastBoardError("Billet déjà scanné (hors ligne).");
                    return;
                  }
                  offlineScannedIds.current.add(found.resId);
                  const eff = effectiveBoardingAssignmentRef.current;
                  await addToBoardingQueue({
                    reservationId: found.resId,
                    agencyId: found.agencyId,
                    companyId: companyId!,
                    tripId: selectedTrip?.id ?? null,
                    date: selectedDate ?? "",
                    heure: selectedTrip?.heure ?? null,
                    assignmentId: eff?.id,
                    vehicleId: eff?.vehicleId,
                    assignmentStatus: eff?.status,
                  });
                  showFastBoardSuccess(true);
                } else {
                  showFastBoardError("Billet introuvable (hors ligne).");
                }
                return;
              }
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
                let scanDetails: { nomClient?: string; depart?: string; arrivee?: string; statutEmbarquement?: string; overtravel?: boolean } | undefined;
                try {
                  const resRef = doc(db, `companies/${companyId}/agences/${found.agencyId}/reservations/${found.resId}`);
                  const resSnap = await getDoc(resRef);
                  if (resSnap.exists()) {
                    const d = resSnap.data() as Record<string, unknown>;
                    const destOrder = d.destinationStopOrder != null ? Number(d.destinationStopOrder) : null;
                    const currentStopOrder = (agencyInfo as { type?: string; stopOrder?: number } | null)?.type === "escale" ? (agencyInfo as { stopOrder?: number }).stopOrder : undefined;
                    const overtravel = currentStopOrder != null && destOrder != null && destOrder < currentStopOrder;
                    scanDetails = { nomClient: (d.nomClient as string) ?? undefined, depart: (d.depart as string) ?? undefined, arrivee: (d.arrivee as string) ?? undefined, statutEmbarquement: (() => { const e = getEffectiveBoardingStatus({ boardingStatus: d.boardingStatus as string, statutEmbarquement: d.statutEmbarquement as string }); return e === "boarded" ? "embarqué" : e === "no_show" ? "absent" : "en_attente"; })(), overtravel };
                  }
                } catch (_) {}
                await updateStatut(found.resId, "embarqué", found.agencyId, { suppressAlert: true });
                showFastBoardSuccess(false, scanDetails);
              } else {
                showFastBoardError("Billet introuvable.");
              }
            } catch (e: any) {
              console.error(e);
              showFastBoardError(normalizeOverlayMessage(e?.message ?? "Erreur lors du scan"));
            }
          }
        );
      }
    })();

    return () => {
      offlineScannedIds.current.clear();
      readerRef.current?.reset?.();
      readerRef.current = null;
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [scanOn, companyId, selectedAgencyId, isOnline, findFromCache, updateStatut, selectedTrip, selectedDate, showFastBoardSuccess, showFastBoardError, normalizeOverlayMessage, agencyInfo]);

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
      if (String(r.statut ?? "").toLowerCase() === INVALID_RESERVATION_STATUT) continue;
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

  const departureRows = useMemo(() => {
    const assignMap = new Map(
      dayAssignments
        .filter((a) => a.status === "planned" || a.status === "validated")
        .map((a) => [`${a.tripId}|${String(a.heure).trim()}`, a])
    );
    const rows: Array<{
      key: string;
      tripId: string;
      departure: string;
      arrival: string;
      heure: string;
      assignmentId?: string;
      vehicleId?: string;
      assignmentStatus?: "planned" | "validated";
      hasAssignment: boolean;
    }> = [];
    const covered = new Set<string>();
    weeklyForDay.forEach((trip) => {
      for (const h of trip.horaires[dayName] || []) {
        const k = `${trip.id}|${h}`;
        covered.add(k);
        const a = assignMap.get(k);
        const vehicleId = String(a?.vehicleId ?? "").trim();
        const hasOperationalAssignment =
          !!a && (a.status === "planned" || a.status === "validated") && vehicleId.length > 0;
        rows.push({
          key: k,
          tripId: trip.id,
          departure: trip.departure,
          arrival: trip.arrival,
          heure: h,
          assignmentId: a?.id,
          vehicleId: vehicleId || undefined,
          assignmentStatus:
            hasOperationalAssignment
              ? a?.status === "validated"
                ? "validated"
                : "planned"
              : undefined,
          hasAssignment: hasOperationalAssignment,
        });
      }
    });
    dayAssignments.forEach((a) => {
      if (a.status !== "planned" && a.status !== "validated") return;
      const k = `${a.tripId}|${String(a.heure).trim()}`;
      if (covered.has(k)) return;
      covered.add(k);
      const trip = weeklyForDay.find((t) => t.id === a.tripId);
      rows.push({
        key: `asg_${a.id}`,
        tripId: a.tripId,
        departure: trip?.departure ?? a.tripId,
        arrival: trip?.arrival ?? "—",
        heure: a.heure,
        assignmentId: a.id,
        vehicleId: String(a.vehicleId ?? "").trim() || undefined,
        assignmentStatus: String(a.vehicleId ?? "").trim()
          ? a.status === "validated"
            ? "validated"
            : "planned"
          : undefined,
        hasAssignment: String(a.vehicleId ?? "").trim().length > 0,
      });
    });
    rows.sort((a, b) => {
      const t = a.heure.localeCompare(b.heure);
      if (t !== 0) return t;
      return `${a.departure}${a.arrival}`.localeCompare(`${b.departure}${b.arrival}`);
    });
    return rows;
  }, [weeklyForDay, dayAssignments, dayName]);

  const trajetButtons = useMemo(() => {
    if (!departureRows.length) return [] as JSX.Element[];
    return departureRows.map((row) => {
      const active =
        selectedTrip?.departure === row.departure &&
        selectedTrip?.arrival === row.arrival &&
        selectedTrip?.heure === row.heure &&
        selectedTrip?.id === row.tripId;
      return (
        <button
          key={row.key}
          type="button"
          onClick={async () => {
            const fallback = dayAssignments.find((a) => {
              const sameTrip = String(a.tripId ?? "") === row.tripId;
              const sameHeure = String(a.heure ?? "").trim() === String(row.heure ?? "").trim();
              const statusOk = a.status === "planned" || a.status === "validated";
              const hasVehicle = String(a.vehicleId ?? "").trim().length > 0;
              return sameTrip && sameHeure && statusOk && hasVehicle;
            });
            const effectiveAssignmentId = row.assignmentId ?? fallback?.id;
            const effectiveVehicleId = row.vehicleId ?? (String(fallback?.vehicleId ?? "").trim() || undefined);
            const effectiveStatus: "planned" | "validated" | undefined =
              row.assignmentStatus ?? (fallback ? (fallback.status === "validated" ? "validated" : "planned") : undefined);

            setSelectedTrip({
              id: row.tripId,
              departure: row.departure,
              arrival: row.arrival,
              heure: row.heure,
            });
            if (!effectiveAssignmentId || !effectiveVehicleId || !effectiveStatus) {
              const held = lockHeldRef.current;
              if (held && isOnline) {
                await closeBoardingSessionLock(held.companyId, held.agencyId, held.assignmentId, held.clientId).catch(() => {});
                lockHeldRef.current = null;
              }
              boardingSlotSnapshotRef.current = null;
              offlineHydratedKeyRef.current = "";
              setActiveBoardingAssignment(null);
              if (companyId && selectedAgencyId) clearBoardingSlotSnapshot(companyId, selectedAgencyId);
              return;
            }
            if (!companyId || !selectedAgencyId) return;
            if (!isOnline) {
              const snap = loadBoardingSlotSnapshot(companyId, selectedAgencyId);
              if (
                snap &&
                snapshotMatchesSelection(snap, {
                  companyId,
                  agencyId: selectedAgencyId,
                  assignmentId: effectiveAssignmentId,
                  date: selectedDate,
                })
              ) {
                boardingSlotSnapshotRef.current = snap;
                setActiveBoardingAssignment({
                  id: snap.assignmentId,
                  vehicleId: snap.vehicleId,
                  status: snap.assignmentStatus,
                });
              } else {
                alert(
                  "Hors ligne : chargez ce créneau une fois en ligne, ou reconnectez-vous pour verrouiller l’embarquement."
                );
                setActiveBoardingAssignment(null);
              }
              return;
            }
            const held = lockHeldRef.current;
            if (held && held.assignmentId !== effectiveAssignmentId) {
              await closeBoardingSessionLock(held.companyId, held.agencyId, held.assignmentId, held.clientId).catch(() => {});
              lockHeldRef.current = null;
            }
            setActiveBoardingAssignment({
              id: effectiveAssignmentId,
              vehicleId: effectiveVehicleId,
              status: effectiveStatus,
            });
          }}
          className={`px-3 py-2 rounded-lg text-sm font-medium shadow-sm flex flex-col items-start gap-1 ${
            active ? "text-white" : row.hasAssignment ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-400 border border-dashed border-gray-300"
          }`}
          style={active ? { background: primary } : undefined}
        >
          <span>
            {row.departure} → {row.arrival} à {row.heure}
          </span>
          <span className="flex flex-wrap items-center gap-1 text-[11px] font-normal opacity-95">
            {row.hasAssignment && row.assignmentStatus ? (
              <span
                className={`px-1.5 py-0.5 rounded ${
                  row.assignmentStatus === "validated"
                    ? active
                      ? "bg-white/20"
                      : "bg-emerald-100 text-emerald-800"
                    : active
                      ? "bg-white/20"
                      : "bg-amber-100 text-amber-900"
                }`}
              >
                {row.assignmentStatus === "validated" ? "Validé" : "Planifié"}
              </span>
            ) : (
              <span className={active ? "text-white/90" : "text-amber-700"}>Aucun véhicule planifié pour ce trajet</span>
            )}
          </span>
        </button>
      );
    });
  }, [departureRows, selectedTrip, primary, companyId, selectedAgencyId, isOnline, selectedDate]);

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-600">
        Chargement…
      </div>
    );
  }

  return (
    <StandardLayoutWrapper>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <PageHeader
          title="Liste d'embarquement"
          subtitle={
            selectedTrip
              ? `${selectedTrip.departure} → ${selectedTrip.arrival} • ${humanDate} ${selectedTrip.heure}${
                  assignmentStatusBadge
                    ? assignmentStatusBadge === "validated"
                      ? " • Validé (logistique)"
                      : " • Planifié"
                    : ""
                }`
              : undefined
          }
          icon={Bus}
        />
        <div
          className="flex items-center gap-2 shrink-0 rounded-full px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: isOnline ? "rgba(34, 197, 94, 0.15)" : "rgba(249, 115, 22, 0.2)",
            color: isOnline ? "#16a34a" : "#ea580c",
          }}
          aria-live="polite"
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: isOnline ? "#16a34a" : "#ea580c" }}
          />
          {isOnline ? "En ligne" : "Mode hors ligne"}
        </div>
      </div>
    <>
      {/* Fast boarding overlay — full screen 1.2s feedback */}
      {fastBoardOverlay && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center text-white"
          style={{
            backgroundColor: fastBoardOverlay.type === "success" ? "#16a34a" : "#dc2626",
          }}
          aria-live="polite"
        >
          {fastBoardOverlay.type === "success" ? (
            <>
              <CheckCircle className="w-24 h-24 mb-4" strokeWidth={2} />
              <span className="text-2xl font-bold">
                {fastBoardOverlay.offline ? "Embarqué (hors ligne)" : "Embarqué"}
              </span>
              {fastBoardOverlay.scanDetails && (
                <div className="mt-4 text-center px-4 max-w-md">
                  <div className="text-lg font-medium">{fastBoardOverlay.scanDetails.nomClient || "—"}</div>
                  <div className="text-sm opacity-90">Origine: {fastBoardOverlay.scanDetails.depart || "—"}</div>
                  <div className="text-sm opacity-90">Destination: {fastBoardOverlay.scanDetails.arrivee || "—"}</div>
                  <div className="text-sm opacity-90">Statut: {fastBoardOverlay.scanDetails.statutEmbarquement || "—"}</div>
                  {fastBoardOverlay.scanDetails.overtravel && (
                    <div className="mt-3 px-3 py-2 bg-white/20 rounded font-bold text-sm">
                      ⚠ PASSAGER AU-DELÀ DE SA DESTINATION
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <AlertTriangle className="w-24 h-24 mb-4" strokeWidth={2} />
              <span className="text-xl font-semibold text-center px-4">
                {fastBoardOverlay.message}
              </span>
            </>
          )}
        </div>
      )}

      <div className="agency-content-transition">
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
              <span className="font-semibold" style={{ color: secondary }}>
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

            <span className="font-semibold" style={{ color: secondary }}>
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
            <DatePicker
              selected={selectedDateObj}
              onChange={(d) => {
                if (!d) return;
                setSelectedDate(toLocalISO(d));
              }}
              dateFormat="dd/MM/yyyy"
              locale={fr}
              shouldCloseOnSelect
              className="border rounded px-3 py-1 w-[120px] bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600"
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
            ) : departureRows.length === 0 ? (
              <div className="text-gray-500 dark:text-gray-200">Aucun créneau hebdomadaire pour cette date</div>
            ) : (
              trajetButtons
            )}
          </div>
          {selectedTrip && !hasOperationalAssignment ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              Ce trajet n’a pas encore de véhicule assigné (tripAssignment). Embarquement et scan sont désactivés jusqu’à planification.
            </div>
          ) : null}
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
              {capacityLimit != null && (
                <div className="px-2 py-1 rounded bg-blue-50 dark:bg-slate-700 border border-blue-200 dark:border-slate-600">
                  <span className="text-gray-500 dark:text-gray-200">Capacité véhicule:</span>{" "}
                  <b className="text-gray-900 dark:text-white">{capacityLimit}</b> places
                  {capacityLimit > 0 && (
                    <span className="ml-1 text-sm">
                      {" "}
                      — Remplissage: {Math.round((totals.seatsEmbarques / capacityLimit) * 100)}%
                    </span>
                  )}
                </div>
              )}
              {capacityLimit != null && capacityLimit > 0 && totals.seatsEmbarques >= capacityLimit && (
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
              disabled={!selectedTrip || !selectedAgencyId || !hasOperationalAssignment}
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
            {isClosed && tripInstanceIdForSlot && !originDepartureDone && (
              <button
                type="button"
                onClick={handleBusParti}
                disabled={sendingOriginDeparture}
                className="w-full sm:w-auto px-3 py-2 rounded-lg text-sm min-h-[40px] bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                title="Enregistrer le départ du bus depuis l'agence d'origine"
              >
                {sendingOriginDeparture ? "Enregistrement…" : "🚌 Bus parti"}
              </button>
            )}
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
          <div className="text-sm font-semibold mb-2" style={{ color: secondary }}>
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
              style={{ background: primary }}
              disabled={(!selectedAgencyId && !userAgencyId) || !hasOperationalAssignment}
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
                    const eff = getEffectiveBoardingStatus(r);
                    const embarked = eff === "boarded";
                    const absent   = eff === "no_show";
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
    </>
    </StandardLayoutWrapper>
  );
};

export default AgenceEmbarquementPage;
