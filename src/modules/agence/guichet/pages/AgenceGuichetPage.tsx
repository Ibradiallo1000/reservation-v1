// ===================================================================
// GUICHET POS — XXL REDESIGN v2
// Professional transport ticketing terminal with all 15 enhancements.
//
// Enhancements:
//   1. Quick-client autocomplete (from recent reservations)
//   2. Quick-resell from RecentSales
//   3. Real-time listener on Rapport tab
//   4. Network resilience indicator
//   5. Full keyboard shortcuts (Esc, F2, Ctrl+P, +/-)
//   6. Session timer in PosSessionBar
//   7. Amount verification vs expected price in EditForm
//   8. Search by reservation code in Rapport tab
//   9. Multi-passenger mode
//  10. Auto-print configurable after sale
//  11. Special tariffs (child, senior, loyalty)
//  12. Session summary modal on close
//  13. Dark mode for night shifts
//  14. Tab transition animations
//  15. Differentiated sound feedback
// ===================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  collection, getDocs, query, where, Timestamp, doc, getDoc,
  updateDoc, orderBy, onSnapshot, runTransaction, setDoc, limit, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveShift } from "@/modules/agence/hooks/useActiveShift";
import {
  createGuichetReservation,
  updateGuichetReservation,
} from "@/modules/agence/services/guichetReservationService";
import {
  listTripInstancesByRouteAndDate,
  listTripInstancesByRouteIdAndDate,
  getOrCreateTripInstanceForSlot,
} from "@/modules/compagnie/tripInstances/tripInstanceService";
import { getRemainingSeats } from "@/modules/compagnie/tripInstances/segmentOccupancyService";
import { getRemainingStopQuota } from "@/modules/compagnie/tripInstances/inventoryQuotaService";
import { getStopByOrder, getEscaleDestinations } from "@/modules/compagnie/routes/routeStopsService";
import { getDeviceFingerprint } from "@/utils/deviceFingerprint";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { makeShortCode } from "@/utils/brand";
import { canCompanyPerformAction } from "@/shared/subscription/restrictions";
import type { SubscriptionStatus } from "@/shared/subscription/types";

import ReceiptModal, {
  type ReservationData as ReceiptReservation,
  type CompanyData as ReceiptCompany,
} from "@/modules/agence/guichet/components/ReceiptModal";

import {
  PosSessionBar, DestinationTiles, DateStrip, TimeSlotGrid,
  SalePanel, RecentSales, ClosedOverlay, SuccessToast,
  SessionSummaryModal, TARIFF_OPTIONS, playSound,
} from "../components/pos";
import { useOnlineStatus, useAgencyDarkMode } from "@/modules/agence/shared";
import type { SaleRow, ClientSuggestion, ToastType } from "../components/pos";

import {
  CalendarDays, Clock4, Receipt, History, Pencil, XCircle, Loader2,
  Search, Moon, Sun, Printer as PrinterIcon,
} from "lucide-react";
import { StatusBadge, ActionButton, SectionCard, EmptyState } from "@/ui";
import { typography } from "@/ui/foundation";
import { updateReservationStatut } from "@/modules/agence/services/reservationStatutService";
import { createCashRefund, markCashTransactionRefunded } from "@/modules/compagnie/cash/cashService";

// ─── Constants ───
/** Statuts réservation : convention canonique sans accent (Phase B). */
const RESERVATION_STATUS = { PAYE: "paye", ANNULE: "annule", CONFIRME: "confirme" } as const;
/** Statut embarquement (affichage UI, distinct de reservation.statut). */
const EMBARKMENT_STATUS = { EMBARQUE: "embarqué", ANNULE: "annulé" } as const;
const CANALS = { GUICHET: "guichet" } as const;
const DAYS_IN_ADVANCE = 8;
const MAX_SEATS_FALLBACK = 30;
const DEFAULT_COMPANY_SLUG = "compagnie-par-defaut";

// ─── Types ───
type WeeklyTrip = { id: string; departure: string; arrival: string; active: boolean; horaires: Record<string, string[]>; price: number; places?: number };
type Trip = { id: string; date: string; time: string; departure: string; arrival: string; price: number; places: number; remainingSeats?: number };
type TicketRow = {
  id: string; referenceCode?: string; date: string; heure: string; depart: string; arrivee: string;
  nomClient: string; telephone?: string; seatsGo: number; seatsReturn?: number; montant: number;
  canal?: string; statutEmbarquement?: string; boardingStatus?: string; statut?: string; trajetId?: string; shiftId?: string;
  createdAt?: any; guichetierCode?: string;
};

/** Passager embarqué : boardingStatus prioritaire, fallback statutEmbarquement. */
function isBoarded(row: { boardingStatus?: string; statutEmbarquement?: string }): boolean {
  if ((row.boardingStatus ?? "").toLowerCase() === "boarded") return true;
  const s = (row.statutEmbarquement ?? "").toLowerCase();
  return s === "embarqué" || s === "embarque";
}
type ShiftReport = {
  shiftId: string; userId: string; userName?: string; userCode?: string;
  startAt: Timestamp; endAt: Timestamp; billets: number; montant: number;
  details: { trajet: string; billets: number; montant: number; heures: string[] }[];
  accountantValidated: boolean; managerValidated: boolean;
};

type EscaleContext = { routeId: string; stopOrder: number; originCity: string; destinationCities: string[]; offsetMinutes?: number };

/** Heure de passage à l’escale = départ origine + offset du stop (minutes). */
function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutesToAdd;
  const h2 = Math.floor(total / 60) % 24;
  const m2 = total % 60;
  return `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
}

// ─── Helpers ───
async function getSellerCode(uid?: string | null) {
  if (!uid) return null;
  try {
    const s = await getDoc(doc(db, "users", uid));
    if (!s.exists()) return null;
    const u = s.data() as any;
    return u.staffCode || u.codeCourt || u.code || null;
  } catch { return null; }
}

async function generateRef(opts: {
  companyId: string; companyCode?: string; agencyId: string; agencyCode?: string; tripInstanceId: string; sellerCode: string;
}) {
  const { companyId, companyCode = "COMP", agencyCode = "AGC", tripInstanceId, sellerCode } = opts;
  const counterRef = doc(db, `companies/${companyId}/counters/byTrip/trips/${tripInstanceId}`);
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const last = snap.exists() ? ((snap.data() as any).lastSeq || 0) : 0;
    const n = last + 1;
    if (!snap.exists()) tx.set(counterRef, { lastSeq: n, updatedAt: Timestamp.now() });
    else tx.update(counterRef, { lastSeq: n, updatedAt: Timestamp.now() });
    return n;
  }).catch(async () => {
    await setDoc(counterRef, { lastSeq: 1, updatedAt: Timestamp.now() }, { merge: true });
    return 1;
  });
  return `${companyCode}-${agencyCode}-${sellerCode}-${String(next).padStart(3, "0")}`;
}

import { validPhoneMali, rawPhoneMali, capitalizeFullName, formatPhoneMaliDisplay } from "../utils/guichetFormatters";
const validPhone = (v: string) => validPhoneMali(v);

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const AgenceGuichetPage: React.FC = () => {
  const location = useLocation();
  const auth = useAuth() as any;
  const { user, company, signOutSafe } = auth ?? {};
  const money = useFormatCurrency();
  const shiftApi = useActiveShift();
  const { activeShift, startShift, pauseShift, continueShift, closeShift, refresh, sessionLockedByOtherDevice } = shiftApi;
  const theme = useCompanyTheme(company) || { primary: "#EA580C", secondary: "#F97316" };
  const isOnline = useOnlineStatus();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const locationState = (location.state || {}) as { fromEscale?: boolean; routeId?: string; stopOrder?: number; originEscaleCity?: string };
  const isEscaleMode = Boolean(locationState.fromEscale && locationState.routeId != null && locationState.stopOrder != null);
  const [escaleContext, setEscaleContext] = useState<EscaleContext | null>(null);

  // ── Tab state (with key for transitions) ──
  const [tab, setTab] = useState<"vente" | "rapport" | "historique">("vente");
  const [tabKey, setTabKey] = useState(0);
  const handleTabChange = useCallback((t: typeof tab) => {
    setTab(t);
    setTabKey((k) => k + 1);
  }, []);

  // ── Company/Agency meta ──
  const [companyMeta, setCompanyMeta] = useState({ name: "Compagnie", code: "COMP", slug: DEFAULT_COMPANY_SLUG, logo: null as string | null, phone: "" });
  const [agencyMeta, setAgencyMeta] = useState({ name: "Agence", code: "AGC", phone: "" });
  const [agencyType, setAgencyType] = useState<string>("");
  const [departure, setDeparture] = useState("");
  const [allArrivals, setAllArrivals] = useState<string[]>([]);

  // ── Sale state ──
  const [arrival, setArrival] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [nomClient, setNomClient] = useState("");
  const [telephone, setTelephone] = useState("");
  const [placesAller, setPlacesAller] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [allReservations, setAllReservations] = useState<TicketRow[]>([]);

  // ── Enhancement states ──
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrint, setAutoPrint] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [tariffKey, setTariffKey] = useState("plein");
  const [additionalPassengers, setAdditionalPassengers] = useState<Array<{ name: string; phone: string }>>([]);

  // ── Session summary ──
  const [showSummary, setShowSummary] = useState(false);
  const [summaryEnd, setSummaryEnd] = useState<Date | null>(null);

  // ── Live session data ──
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [pendingReports, setPendingReports] = useState<ShiftReport[]>([]);
  const [historyReports, setHistoryReports] = useState<ShiftReport[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Receipt ──
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptReservation | null>(null);
  const [receiptCompany, setReceiptCompany] = useState<ReceiptCompany | null>(null);

  // ── Toast ──
  const [successMessage, setSuccessMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastType, setToastType] = useState<ToastType>("success");

  // ── Edit / Cancel ──
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; nomClient: string; telephone?: string; seatsGo: number; seatsReturn?: number; montant: number; expectedPrice?: number } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // ── Seller code ──
  const [sellerCodeCached, setSellerCodeCached] = useState("GUEST");
  const staffCodeForSale = (user as any)?.staffCode || (user as any)?.codeCourt || (user as any)?.code || "GUEST";

  const status: "active" | "paused" | "closed" | "pending" | "none" = (activeShift?.status as any) ?? "none";
  const canSell = status === "active" && !!user?.companyId && !!user?.agencyId && !sessionLockedByOtherDevice;
  const isCounterOpen = status === "active" || status === "paused";

  // ── Session start time for timer ──
  const sessionStartedAt = useMemo(() => {
    const raw = activeShift?.startAt ?? activeShift?.startTime;
    if (!raw) return null;
    return typeof raw.toDate === "function" ? raw.toDate() : new Date(raw as any);
  }, [activeShift?.startAt, activeShift?.startTime]);

  // ── Tariff multiplier ──
  const tariffMultiplier = TARIFF_OPTIONS.find((t) => t.key === tariffKey)?.multiplier ?? 1;

  // ── Client suggestions from all reservations ──
  const clientSuggestions: ClientSuggestion[] = useMemo(() => {
    const map = new Map<string, ClientSuggestion>();
    for (const r of allReservations) {
      if (!r.nomClient) continue;
      const key = r.nomClient.toLowerCase().trim();
      if (!map.has(key)) map.set(key, { name: r.nomClient, phone: r.telephone || "" });
    }
    return Array.from(map.values());
  }, [allReservations]);

  const showToast = useCallback((msg: string, type: ToastType = "success") => {
    setSuccessMessage(msg);
    setToastType(type);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3500);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      if (typeof signOutSafe === "function") { await signOutSafe(); return; }
      if (typeof auth?.logout === "function") { await auth.logout(); return; }
      window.location.href = "/login";
    } catch { window.location.href = "/login"; }
  }, [signOutSafe, auth]);

  const availableDates = useMemo(
    () => Array.from({ length: DAYS_IN_ADVANCE }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    }), [],
  );

  const isPastTime = useCallback((dateISO: string, hhmm: string) => {
    const [H, M] = hhmm.split(":").map(Number);
    const d = new Date(dateISO); d.setHours(H, M, 0, 0);
    return d.getTime() < Date.now();
  }, []);

  // ═══════════════ KEYBOARD SHORTCUTS ═══════════════
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const inInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;

      if (e.key === "Escape") {
        if (editOpen) { setEditOpen(false); setEditTarget(null); return; }
        if (showReceipt) { setShowReceipt(false); return; }
        if (showSummary) { setShowSummary(false); return; }
        if (selectedTrip) { setSelectedTrip(null); return; }
      }

      if (e.key === "F2") {
        e.preventDefault();
        const tabs: Array<typeof tab> = ["vente", "rapport", "historique"];
        const idx = tabs.indexOf(tab);
        handleTabChange(tabs[(idx + 1) % tabs.length]);
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (receiptData) { setShowReceipt(true); return; }
        window.print();
        return;
      }

      if (!inInput) {
        if (e.key === "+" || e.key === "=") { e.preventDefault(); setPlacesAller((p) => p + 1); return; }
        if (e.key === "-" && placesAller > 1) { e.preventDefault(); setPlacesAller((p) => Math.max(1, p - 1)); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editOpen, showReceipt, showSummary, selectedTrip, tab, handleTabChange, receiptData, placesAller]);

  // ═══════════════ DATA INIT ═══════════════
  useEffect(() => {
    (async () => {
      try {
        if (user?.uid) {
          const sc = await getSellerCode(user.uid);
          if (sc) setSellerCodeCached(sc);
        }
        if (!user?.companyId || !user?.agencyId) return;
        const compSnap = await getDoc(doc(db, "companies", user.companyId));
        if (compSnap.exists()) {
          const c = compSnap.data() as any;
          const name = c.nom || c.name || "Compagnie";
          setCompanyMeta({ name, code: makeShortCode(name, c.code), slug: c.slug || DEFAULT_COMPANY_SLUG, logo: c.logoUrl || c.logo || null, phone: c.telephone || "" });
        }
        const agSnap = await getDoc(doc(db, `companies/${user.companyId}/agences/${user.agencyId}`));
        if (agSnap.exists()) {
          const a = agSnap.data() as any;
          const ville = a?.ville || a?.city || a?.nomVille || a?.villeDepart || "";
          setDeparture((ville || "").toString());
          setAgencyMeta({ name: a?.nomAgence || a?.nom || ville || "Agence", code: makeShortCode(a?.nomAgence || a?.nom || ville, a?.code), phone: a?.telephone || "" });
          setAgencyType((a?.type as string) || "");
        }
        if (!isEscaleMode || !locationState.routeId || locationState.stopOrder == null) {
          const weeklyRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/weeklyTrips`);
          const snap = await getDocs(query(weeklyRef, where("active", "==", true)));
          const arr = Array.from(new Set(snap.docs.map((d) => (d.data() as WeeklyTrip).arrival).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"));
          setAllArrivals(arr);
          setEscaleContext(null);
          return;
        }
        const routeId = locationState.routeId;
        const stopOrder = Number(locationState.stopOrder);
        const originStop = await getStopByOrder(user.companyId, routeId, stopOrder);
        const destinations = await getEscaleDestinations(user.companyId, routeId, stopOrder);
        const originCity = originStop?.city ?? locationState.originEscaleCity ?? "";
        const destinationCities = destinations.map((s) => s.city).filter(Boolean);
        const offsetMinutes = originStop?.estimatedArrivalOffsetMinutes ?? 0;
        setDeparture(originCity);
        setAllArrivals(destinationCities);
        setEscaleContext({ routeId, stopOrder, originCity, destinationCities, offsetMinutes });
        if (destinationCities.length > 0) setArrival(destinationCities[0]);
      } catch (e) { console.error("[GUICHET] init:error", e); }
    })();
  }, [user?.uid, user?.companyId, user?.agencyId, isEscaleMode, locationState.routeId, locationState.stopOrder, locationState.originEscaleCity]);

  // ═══════════════ LIVE RESERVATIONS ═══════════════
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId) return;
    const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
    const q = query(rRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows: TicketRow[] = snap.docs.map((d) => {
        const r = d.data() as any;
        return {
          id: d.id, referenceCode: r.referenceCode, date: r.date, heure: r.heure,
          depart: r.depart, arrivee: r.arrivee, nomClient: r.nomClient, telephone: r.telephone,
          seatsGo: r.seatsGo || 1, seatsReturn: r.seatsReturn || 0, montant: r.montant || 0,
          canal: r.canal, statutEmbarquement: r.statutEmbarquement, boardingStatus: r.boardingStatus, statut: r.statut,
          trajetId: r.trajetId, shiftId: r.shiftId, createdAt: r.createdAt,
          guichetierCode: r.guichetierCode || "",
        };
      });
      setAllReservations(rows);
    });
    return () => unsub();
  }, [user?.companyId, user?.agencyId]);

  // ═══════════════ TRIP SEARCH (source de vérité: tripInstances) ═══════════════
  const loadRemainingForDate = useCallback((dateISO: string, _dep: string, _arr: string, baseList?: Trip[], pickFirst = false) => {
    const src = baseList ?? trips;
    const filtered = src.filter((t) => t.date === dateISO && !isPastTime(t.date, t.time)).sort((a, b) => a.time.localeCompare(b.time));
    setFilteredTrips(filtered);
    if (pickFirst && filtered.length > 0) {
      const first = filtered.find((f) => (f.remainingSeats === undefined) ? true : f.remainingSeats! > 0) || filtered[0];
      setSelectedTrip((prev) => prev ?? first);
    }
  }, [trips, isPastTime]);

  const searchTrips = useCallback(async (dep: string, arr: string) => {
    setTrips([]); setFilteredTrips([]); setSelectedTrip(null); setSelectedDate("");
    if (!user?.companyId) return;
    if (escaleContext) {
      if (!arr?.trim()) return;
      const originCity = escaleContext.originCity;
      const out: Trip[] = [];
      const now = new Date();
      for (let i = 0; i < DAYS_IN_ADVANCE; i++) {
        const d = new Date(now); d.setDate(now.getDate() + i);
        const dateISO = d.toISOString().split("T")[0];
        const instances = await listTripInstancesByRouteIdAndDate(user.companyId, escaleContext.routeId, dateISO);
        const remainingMap: Record<string, number> = {};
        const stopOrder = escaleContext.stopOrder;
        await Promise.all(
          instances.map(async (ti) => {
            if ((ti as { status?: string }).status === "cancelled") return;
            const r = await getRemainingStopQuota(user.companyId, ti.id, stopOrder);
            remainingMap[ti.id] = r;
          })
        );
        for (const ti of instances) {
          if ((ti as { status?: string }).status === "cancelled") continue;
          const capacity = (ti as any).seatCapacity ?? (ti as any).capacitySeats ?? MAX_SEATS_FALLBACK;
          const remaining = remainingMap[ti.id] ?? capacity - ((ti as any).reservedSeats ?? 0);
          if (remaining <= 0) continue;
          if (dateISO === now.toISOString().split("T")[0] && isPastTime(dateISO, (ti as any).departureTime)) continue;
          const tiRouteId = (ti as { routeId?: string }).routeId;
          if (tiRouteId != null && tiRouteId !== escaleContext.routeId) continue;
          const depTime = (ti as any).departureTime ?? "00:00";
          const passageEscaleTime = addMinutesToTime(depTime, escaleContext.offsetMinutes ?? 0);
          out.push({
            id: ti.id,
            date: ti.date,
            time: passageEscaleTime,
            departure: originCity,
            arrival: arr.trim(),
            price: (ti as any).price ?? 0,
            places: capacity,
            remainingSeats: remaining,
          });
        }
      }
      out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      const future = out.filter((t) => !isPastTime(t.date, t.time));
      setTrips(future);
      const firstDate = future[0]?.date || "";
      setSelectedDate(firstDate);
      setSelectedTrip(null);
      if (firstDate) loadRemainingForDate(firstDate, originCity, arr, future, true);
      else setFilteredTrips([]);
      return;
    }
    if (!dep || !arr || !user?.agencyId) return;
    const depNorm = dep.trim().toLowerCase();
    const arrNorm = arr.trim().toLowerCase();
    const out: Trip[] = [];
    const now = new Date();
    for (let i = 0; i < DAYS_IN_ADVANCE; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const dateISO = d.toISOString().split("T")[0];
      const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
      let instances = await listTripInstancesByRouteAndDate(user.companyId, dep, arr, dateISO);
      if (instances.length === 0) {
        const weeklyRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/weeklyTrips`);
        const weeklySnap = await getDocs(query(weeklyRef, where("active", "==", true)));
        const weekly = weeklySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as WeeklyTrip[];
        for (const w of weekly) {
          if (!w.active || (w.departure || "").toLowerCase().trim() !== depNorm || (w.arrival || "").toLowerCase().trim() !== arrNorm) continue;
          const horaires = w.horaires?.[dayName] || [];
          for (const h of horaires) {
            await getOrCreateTripInstanceForSlot(user.companyId, {
              agencyId: user.agencyId,
              departureCity: dep.trim(),
              arrivalCity: arr.trim(),
              date: dateISO,
              departureTime: h,
              seatCapacity: w.places || MAX_SEATS_FALLBACK,
              price: w.price ?? 0,
              weeklyTripId: w.id,
            });
          }
        }
        instances = await listTripInstancesByRouteAndDate(user.companyId, dep, arr, dateISO);
      }
      const remainingMap: Record<string, number> = {};
      await Promise.all(
        instances.map(async (ti) => {
          if ((ti as any).routeId) {
            const r = await getRemainingSeats(user.companyId, ti.id);
            remainingMap[ti.id] = r;
          }
        })
      );
      for (const ti of instances) {
        if (ti.agencyId !== user.agencyId) continue;
        if ((ti as { status?: string }).status === "cancelled") continue;
        const capacity = (ti as any).seatCapacity ?? (ti as any).capacitySeats ?? MAX_SEATS_FALLBACK;
        const reserved = (ti as any).reservedSeats ?? 0;
        const remaining = (ti as any).routeId && remainingMap[ti.id] !== undefined
          ? remainingMap[ti.id]
          : capacity - reserved;
        if (remaining <= 0) continue;
        if (dateISO === now.toISOString().split("T")[0] && isPastTime(dateISO, (ti as any).departureTime)) continue;
        out.push({
          id: ti.id,
          date: ti.date,
          time: (ti as any).departureTime,
          departure: (ti as any).departureCity ?? (ti as any).routeDeparture ?? dep,
          arrival: (ti as any).arrivalCity ?? (ti as any).routeArrival ?? arr,
          price: (ti as any).price ?? 0,
          places: capacity,
          remainingSeats: remaining,
        });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const future = out.filter((t) => !isPastTime(t.date, t.time));
    setTrips(future);
    const firstDate = future[0]?.date || "";
    setSelectedDate(firstDate);
    setSelectedTrip(null);
    if (firstDate) loadRemainingForDate(firstDate, dep, arr, future, true);
    else setFilteredTrips([]);
  }, [isPastTime, user?.agencyId, user?.companyId, loadRemainingForDate, escaleContext]);

  const searchTripsRef = useRef(searchTrips);
  searchTripsRef.current = searchTrips;
  useEffect(() => {
    if (!arrival) { setTrips([]); setFilteredTrips([]); setSelectedTrip(null); setSelectedDate(""); return; }
    searchTripsRef.current(departure, arrival);
  }, [arrival, departure]);

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date);
    setSelectedTrip(null);
    loadRemainingForDate(date, departure, arrival, undefined, true);
  }, [arrival, departure, loadRemainingForDate]);

  // ═══════════════ QUICK-RESELL ═══════════════
  const handleQuickResell = useCallback((sale: SaleRow) => {
    if (!canSell) return;
    const matchingArrival = allArrivals.find((a) => a.toLowerCase() === sale.arrivee.toLowerCase());
    if (matchingArrival && matchingArrival !== arrival) {
      setArrival(matchingArrival);
    }
    handleTabChange("vente");
    if (soundEnabled) playSound("click");
  }, [canSell, allArrivals, arrival, handleTabChange, soundEnabled]);

  // ═══════════════ PRICING (with tariff) ═══════════════
  const totalPrice = useMemo(() => {
    if (!selectedTrip) return 0;
    return Math.max(0, Math.round(selectedTrip.price * Math.max(0, placesAller) * tariffMultiplier));
  }, [selectedTrip, placesAller, tariffMultiplier]);

  const canValidateSale = useMemo(() => {
    if (!canSell || !selectedTrip) return false;
    if (selectedTrip.remainingSeats !== undefined && selectedTrip.remainingSeats <= 0) return false;
    if (placesAller <= 0) return false;
    if (selectedTrip.remainingSeats !== undefined && placesAller > selectedTrip.remainingSeats) return false;
    if (!nomClient.trim() || !validPhone(telephone) || totalPrice <= 0 || isProcessing) return false;
    return true;
  }, [canSell, selectedTrip, placesAller, nomClient, telephone, totalPrice, isProcessing]);

  const validationHint = useMemo(() => {
    if (!selectedTrip) return "";
    if (!nomClient.trim()) return "Entrez le nom du passager";
    if (!telephone) return "Entrez un numéro de téléphone";
    if (!validPhone(telephone)) return "Téléphone invalide (8 chiffres, Mali)";
    if (totalPrice <= 0) return "Montant invalide";
    if (selectedTrip.remainingSeats !== undefined && selectedTrip.remainingSeats <= 0) return "Plus de places disponibles";
    if (selectedTrip.remainingSeats !== undefined && placesAller > selectedTrip.remainingSeats) return "Pas assez de places";
    return "Remplissez tous les champs obligatoires";
  }, [selectedTrip, nomClient, telephone, totalPrice, placesAller]);

  // ═══════════════ RESERVATION ═══════════════
  const handleReservation = useCallback(async () => {
    if (!selectedTrip || !nomClient || !telephone) return;
    const normalizedName = capitalizeFullName(nomClient);
    if (!isOnline) { showToast("Pas de connexion internet. Réessayez.", "error"); if (soundEnabled) playSound("error"); return; }
    const companyData = company as Record<string, unknown> | null;
    const subStatus = (companyData?.subscriptionStatus as SubscriptionStatus) ?? "active";
    const actionCheck = canCompanyPerformAction(subStatus, "CREATE_RESERVATION");
    if (!actionCheck.allowed) { alert(actionCheck.reason || "Action non autorisée."); return; }
    if (!canSell) {
      alert(sessionLockedByOtherDevice ? "Poste ouvert sur un autre appareil." : "Ouvrez votre comptoir.");
      return;
    }
    if (!validPhone(telephone)) { alert("Téléphone invalide."); return; }
    if (selectedTrip.remainingSeats !== undefined && placesAller > selectedTrip.remainingSeats) {
      alert(`Il reste ${selectedTrip.remainingSeats} places.`); return;
    }
    setIsProcessing(true);
    try {
      const referenceCode = await generateRef({
        companyId: user!.companyId, companyCode: companyMeta.code,
        agencyId: user!.agencyId, agencyCode: agencyMeta.code,
        tripInstanceId: selectedTrip.id, sellerCode: sellerCodeCached || staffCodeForSale,
      });

      const passengersField = additionalPassengers.length > 0
        ? [{ name: normalizedName, phone: rawPhoneMali(telephone) }, ...additionalPassengers.filter((p) => p.name.trim()).map((p) => ({ name: capitalizeFullName(p.name), phone: rawPhoneMali(p.phone) }))]
        : undefined;

      const newId = await createGuichetReservation({
        companyId: user!.companyId, agencyId: user!.agencyId, userId: user!.uid,
        sessionId: activeShift!.id, userCode: sellerCodeCached || staffCodeForSale,
        trajetId: selectedTrip.id, date: selectedTrip.date, heure: selectedTrip.time,
        depart: selectedTrip.departure, arrivee: selectedTrip.arrival,
        nomClient: normalizedName,
        telephone: rawPhoneMali(telephone) || null,
        telephoneOriginal: telephone.trim() || null,
        seatsGo: placesAller,
        seatsReturn: 0,
        montant: totalPrice, companySlug: companyMeta.slug,
        compagnieNom: companyMeta.name, agencyNom: agencyMeta.name,
        agencyTelephone: agencyMeta.phone ?? null, referenceCode, tripType: "aller_simple",
        tripInstanceId: selectedTrip.id,
        ...(tariffKey !== "plein" ? { tariff: tariffKey, tariffMultiplier } : {}),
        ...(passengersField ? { passengers: passengersField } : {}),
      } as any, { deviceFingerprint: getDeviceFingerprint() });

      setTrips((prev) => prev.map((t) => t.id === selectedTrip.id ? { ...t, remainingSeats: Math.max(0, (t.remainingSeats ?? t.places) - placesAller) } : t));
      setFilteredTrips((prev) => prev.map((t) => t.id === selectedTrip.id ? { ...t, remainingSeats: Math.max(0, (t.remainingSeats ?? t.places) - placesAller) } : t));

      setReceiptData({
        id: newId, nomClient: normalizedName, telephone: rawPhoneMali(telephone) || telephone, date: selectedTrip.date, heure: selectedTrip.time,
        depart: selectedTrip.departure, arrivee: selectedTrip.arrival,
        seatsGo: placesAller, seatsReturn: 0,
        montant: totalPrice, statut: RESERVATION_STATUS.PAYE, paiement: "espèces",
        agencyNom: agencyMeta.name, agenceTelephone: agencyMeta.phone,
        createdAt: new Date(), referenceCode,
      });
      setReceiptCompany({
        nom: companyMeta.name, logoUrl: companyMeta.logo || undefined,
        couleurPrimaire: theme.primary, couleurSecondaire: theme.secondary,
        slug: companyMeta.slug, telephone: companyMeta.phone || undefined,
      });
      setShowReceipt(true);

      const msg = `Réservation confirmée — ${normalizedName} • ${placesAller} place(s) • ${money(totalPrice)}`;
      showToast(msg);
      if (soundEnabled) playSound("success");

      if (autoPrint) setTimeout(() => window.print(), 500);

      setNomClient(""); setTelephone(""); setPlacesAller(1);
      setTariffKey("plein"); setAdditionalPassengers([]);
    } catch (e) {
      console.error("[GUICHET] reservation:error", e);
      showToast("Erreur lors de la réservation.", "error");
      if (soundEnabled) playSound("error");
    } finally { setIsProcessing(false); }
  }, [selectedTrip, nomClient, telephone, canSell, placesAller, totalPrice, user, activeShift, companyMeta, agencyMeta, sellerCodeCached, staffCodeForSale, theme, company, sessionLockedByOtherDevice, soundEnabled, money, isOnline, showToast, autoPrint, tariffKey, tariffMultiplier, additionalPassengers]);

  // ═══════════════ CANCEL / EDIT ═══════════════
  const cancelReservation = useCallback(async (row: TicketRow) => {
    if (!user?.companyId || !user?.agencyId) return;
    if (row.canal && row.canal !== CANALS.GUICHET) { alert("Annulation uniquement pour les ventes guichet."); return; }
    if (isBoarded(row)) { alert("Impossible : passager embarqué."); return; }
    if (row.statutEmbarquement === EMBARKMENT_STATUS.ANNULE || row.montant === 0) { alert("Déjà annulé."); return; }
    const reason = prompt("Motif d'annulation (min. 5 caractères) :") || "";
    if (!reason.trim() || reason.length < 5) { alert("Motif requis (min. 5 caractères)."); return; }
    if (!window.confirm(`Annuler la réservation de ${row.nomClient} (${money(row.montant)}) ?`)) return;
    setCancelingId(row.id);
    try {
      const resRef = doc(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations/${row.id}`);
      await updateReservationStatut(
        resRef,
        "annulation_en_attente",
        { userId: user.uid, userRole: (user as { role?: string })?.role ?? "guichetier" },
        {
          statutEmbarquement: EMBARKMENT_STATUS.ANNULE,
          montantOriginal: row.montant,
          montant: 0,
          cancelReason: reason.trim(),
          canceledBy: { id: user.uid, name: user.displayName || user.email || null, code: sellerCodeCached, timestamp: serverTimestamp() },
          annulation: { demandePar: user.uid, demandeLe: serverTimestamp(), motif: reason.trim(), canal: "guichet" },
        }
      );
      const refundAmount = Number(row.montant ?? 0) || 0;
      if (refundAmount > 0) {
        try {
          const agencySnap = await getDoc(doc(db, "companies", user.companyId, "agences", user.agencyId));
          const agencyType = (agencySnap.data() as { type?: string })?.type?.toLowerCase();
          const locationType = agencyType === "escale" ? "escale" : "agence";
          await createCashRefund({
            companyId: user.companyId,
            reservationId: row.id,
            amount: refundAmount,
            locationType,
            locationId: user.agencyId,
            createdBy: user.uid,
            reason: reason.trim() || "Annulation guichet",
          });
          const resSnap = await getDoc(resRef);
          const cashTxId = (resSnap.data() as { cashTransactionId?: string })?.cashTransactionId;
          if (cashTxId) {
            await markCashTransactionRefunded(user.companyId, cashTxId);
          }
        } catch (e) {
          console.error("[GUICHET] createCashRefund failed:", e);
        }
      }
      setTickets((prev) => prev.map((t) => t.id === row.id ? { ...t, montant: 0, statut: "annulation_en_attente", statutEmbarquement: EMBARKMENT_STATUS.ANNULE } : t));
      if (soundEnabled) playSound("error");
    } catch {
      alert("Échec de l'annulation.");
    }
    finally { setCancelingId(null); }
  }, [user?.companyId, user?.agencyId, user?.uid, user?.displayName, user?.email, sellerCodeCached, money, soundEnabled]);

  const openEdit = useCallback((row: TicketRow) => {
    if (isBoarded(row)) { alert("Modification impossible : passager embarqué."); return; }
    if (row.statutEmbarquement === EMBARKMENT_STATUS.ANNULE || row.montant === 0) { alert("Déjà annulé."); return; }
    setEditTarget({ id: row.id, nomClient: row.nomClient, telephone: row.telephone, seatsGo: row.seatsGo ?? 1, seatsReturn: row.seatsReturn ?? 0, montant: row.montant ?? 0, expectedPrice: row.montant ?? 0 });
    setEditOpen(true);
  }, []);

  const saveEdit = useCallback(async (payload: { id: string; nomClient: string; telephone?: string; telephoneOriginal?: string; seatsGo: number; seatsReturn?: number; montant: number; editReason?: string }) => {
    if (!user?.companyId || !user?.agencyId) return;
    setIsSavingEdit(true);
    try {
      await updateGuichetReservation(user.companyId, user.agencyId, payload.id, {
        nomClient: payload.nomClient,
        telephone: payload.telephone ?? null,
        telephoneOriginal: payload.telephoneOriginal ?? payload.telephone ?? null,
        seatsGo: payload.seatsGo ?? 1, seatsReturn: payload.seatsReturn ?? 0,
        montant: payload.montant ?? 0, editReason: payload.editReason ?? null,
      }, { id: user.uid, name: user.displayName || user.email || null });
      setTickets((prev) => prev.map((t) => t.id === payload.id ? { ...t, nomClient: payload.nomClient, telephone: payload.telephone, seatsGo: Math.max(1, payload.seatsGo || 1), seatsReturn: Math.max(0, payload.seatsReturn || 0), montant: Math.max(0, payload.montant || 0) } : t));
      setEditOpen(false); setEditTarget(null);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Échec."); }
    finally { setIsSavingEdit(false); }
  }, [user?.companyId, user?.agencyId, user?.uid, user?.displayName, user?.email]);

  // ═══════════════ REPORT DATA (real-time for active session) ═══════════════
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId || !activeShift?.id) { setTickets([]); return; }
    if (!(status === "active" || status === "paused" || status === "pending")) { setTickets([]); return; }

    setLoadingReport(true);
    const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
    const q = query(rRef, where("shiftId", "==", activeShift.id), where("canal", "==", CANALS.GUICHET), orderBy("createdAt", "asc"));

    const unsub = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map((d) => {
        const r = d.data() as any;
        return { id: d.id, referenceCode: r.referenceCode, date: r.date, heure: r.heure, depart: r.depart, arrivee: r.arrivee, nomClient: r.nomClient, telephone: r.telephone, seatsGo: r.seatsGo || 1, seatsReturn: r.seatsReturn || 0, montant: r.montant || 0, canal: r.canal, statutEmbarquement: r.statutEmbarquement, boardingStatus: r.boardingStatus, statut: r.statut, trajetId: r.trajetId, createdAt: r.createdAt, guichetierCode: r.guichetierCode || "" };
      }));
      setLoadingReport(false);
    }, (err) => {
      console.error("[GUICHET] report listener error", err);
      setLoadingReport(false);
    });

    return () => unsub();
  }, [user?.companyId, user?.agencyId, activeShift?.id, status]);

  const loadPendingReports = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId || !user?.uid) { setPendingReports([]); return; }
    setLoadingPending(true);
    try {
      const base = `companies/${user.companyId}/agences/${user.agencyId}`;
      const repRef = collection(db, `${base}/shiftReports`);
      const [s1, s2] = await Promise.all([
        getDocs(query(repRef, where("userId", "==", user.uid), where("accountantValidated", "==", false))),
        getDocs(query(repRef, where("userId", "==", user.uid), where("accountantValidated", "==", true), where("managerValidated", "==", false))),
      ]);
      const rows: ShiftReport[] = [...s1.docs, ...s2.docs].map((d) => {
        const r = d.data() as any;
        return { shiftId: d.id, userId: r.userId, userName: r.userName, userCode: r.userCode, startAt: r.startAt, endAt: r.endAt, billets: r.billets || 0, montant: r.montant || 0, details: Array.isArray(r.details) ? r.details : [], accountantValidated: !!r.accountantValidated, managerValidated: !!r.managerValidated };
      }).sort((a, b) => (b.endAt?.toMillis?.() ?? 0) - (a.endAt?.toMillis?.() ?? 0));
      setPendingReports(rows);
    } catch (e) { console.error(e); }
    finally { setLoadingPending(false); }
  }, [user?.companyId, user?.agencyId, user?.uid]);

  const loadHistory = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId || !user?.uid) { setHistoryReports([]); return; }
    setLoadingHistory(true);
    try {
      const repRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/shiftReports`);
      const snap = await getDocs(query(repRef, where("userId", "==", user.uid), where("accountantValidated", "==", true), where("managerValidated", "==", true), orderBy("endAt", "desc"), limit(50)));
      setHistoryReports(snap.docs.map((d) => {
        const r = d.data() as any;
        return { shiftId: d.id, userId: r.userId, userName: r.userName, userCode: r.userCode, startAt: r.startAt, endAt: r.endAt, billets: r.billets || 0, montant: r.montant || 0, details: Array.isArray(r.details) ? r.details : [], accountantValidated: true, managerValidated: true };
      }));
    } catch (e) { console.error(e); }
    finally { setLoadingHistory(false); }
  }, [user?.companyId, user?.agencyId, user?.uid]);

  useEffect(() => {
    if (tab === "rapport") loadPendingReports();
  }, [tab, loadPendingReports]);

  useEffect(() => { if (tab === "historique") loadHistory(); }, [tab, loadHistory]);

  // ── Session totals for top bar ──
  const sessionTotals = useMemo(() => {
    let billets = 0, montant = 0;
    for (const t of tickets) {
      if (t.statutEmbarquement === EMBARKMENT_STATUS.ANNULE || t.montant === 0) continue;
      billets += (t.seatsGo || 0) + (t.seatsReturn || 0);
      montant += t.montant || 0;
    }
    return { billets, montant };
  }, [tickets]);

  const reportDateLabel = useMemo(() => {
    const start = activeShift?.startAt?.toDate?.() || activeShift?.startTime?.toDate?.();
    if (!start) return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }, [activeShift?.startAt, activeShift?.startTime]);

  // ── Filtered tickets for search ──
  const filteredTickets = useMemo(() => {
    if (!reportSearch.trim()) return tickets;
    const q = reportSearch.toLowerCase();
    return tickets.filter((t) =>
      (t.referenceCode || "").toLowerCase().includes(q) ||
      t.nomClient.toLowerCase().includes(q) ||
      (t.telephone || "").includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }, [tickets, reportSearch]);

  // ═══════════════ SESSION CLOSE WITH SUMMARY ═══════════════
  const handleSessionClose = useCallback(async () => {
    try {
      await closeShift();
      setSummaryEnd(new Date());
      setShowSummary(true);
      if (soundEnabled) playSound("close");
      handleTabChange("rapport");
    } catch (e: any) { alert(e?.message || "Erreur"); }
  }, [closeShift, soundEnabled, handleTabChange]);

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className={`h-screen flex flex-col bg-gray-50 overflow-hidden ${darkMode ? "agency-dark" : ""}`}>

      {/* Toast */}
      <SuccessToast message={successMessage} visible={toastVisible} primaryColor={theme.primary} type={toastType} />

      {/* Session top bar */}
      <PosSessionBar
        status={status}
        locked={sessionLockedByOtherDevice}
        userName={user?.displayName || user?.email || "—"}
        userCode={sellerCodeCached || staffCodeForSale}
        companyLogo={companyMeta.logo}
        companyName={companyMeta.name}
        agencyName={agencyMeta.name}
        sessionTickets={sessionTotals.billets}
        sessionRevenue={money(sessionTotals.montant)}
        primaryColor={theme.primary}
        secondaryColor={theme.secondary}
        sessionStartedAt={sessionStartedAt}
        isOnline={isOnline}
        onStart={() => startShift().catch((e: any) => alert(e?.message || "Erreur"))}
        onPause={() => pauseShift().catch((e: any) => alert(e?.message || "Erreur"))}
        onContinue={() => continueShift().catch((e: any) => alert(e?.message || "Erreur"))}
        onClose={handleSessionClose}
        onRefresh={() => refresh().catch(() => {})}
        onLogout={handleLogout}
      />

      {/* Tab navigation */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6">
        <div className="max-w-[1600px] mx-auto flex items-center gap-1">
          {([
            { key: "vente" as const, label: "Guichet", icon: Receipt },
            { key: "rapport" as const, label: "Rapport", icon: CalendarDays },
            { key: "historique" as const, label: "Historique", icon: History },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-current text-current"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              style={tab === key ? { color: theme.primary } : undefined}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}

          {/* Right side controls */}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Auto-print toggle */}
            <button
              onClick={() => setAutoPrint(!autoPrint)}
              className={`px-2 py-1 rounded-md transition text-xs ${autoPrint ? "text-white" : "text-gray-400 hover:bg-gray-100"}`}
              style={autoPrint ? { backgroundColor: theme.primary } : undefined}
              title={autoPrint ? "Impression auto activée" : "Impression auto désactivée"}
            >
              <PrinterIcon className="w-3.5 h-3.5" />
            </button>

            {/* Sound toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`px-2 py-1 rounded-md transition text-xs ${soundEnabled ? "bg-gray-100 text-gray-600" : "text-gray-400"}`}
              title={soundEnabled ? "Son activé" : "Son désactivé"}
            >
              {soundEnabled ? "🔊" : "🔇"}
            </button>

            {/* Dark mode toggle (partagé avec les autres espaces agence) */}
            <button
              onClick={toggleDarkMode}
              className={`px-2 py-1 rounded-md transition text-xs ${darkMode ? "bg-gray-700 text-yellow-300" : "text-gray-400 hover:bg-gray-100"}`}
              title={darkMode ? "Mode jour" : "Mode nuit"}
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            {/* Keyboard shortcut hint */}
            <span className="hidden xl:block text-[10px] text-gray-300 ml-2">
              F2:onglet · Esc:fermer · +/-:places · Ctrl+P:imprimer
            </span>
          </div>
        </div>
      </div>

      {/* Main content with tab animation */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div key={tabKey} className={`agency-content-transition ${tab === "vente" ? "h-full" : ""}`}>
          {/* ═══════ VENTE TAB ═══════ */}
          {tab === "vente" && (
            !isCounterOpen && !sessionLockedByOtherDevice ? (
              <ClosedOverlay
                status={status === "pending" ? "pending" : "none"}
                locked={false}
                primaryColor={theme.primary}
                secondaryColor={theme.secondary}
                onStart={() => startShift().catch((e: any) => alert(e?.message || "Erreur"))}
                onRefresh={() => refresh().catch(() => {})}
                activationByEscaleManager={agencyType === "escale"}
              />
            ) : sessionLockedByOtherDevice ? (
              <ClosedOverlay
                status="none"
                locked={true}
                primaryColor={theme.primary}
                secondaryColor={theme.secondary}
                onStart={() => {}}
                onRefresh={() => refresh().catch(() => {})}
                activationByEscaleManager={agencyType === "escale"}
              />
            ) : (
              <div className="max-w-[1600px] mx-auto p-4 lg:p-6 h-full flex flex-col min-h-0">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 min-h-0">
                  {/* LEFT: Journey selection (3/5) — scroll si besoin */}
                  <div className="lg:col-span-3 space-y-5 overflow-y-auto min-h-0">
                    {/* Destination (départ = agence ou escale fixe) */}
                    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      {isEscaleMode && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1.5 mb-3 inline-block">
                          Vente depuis l&apos;escale — Départ fixe, destinations limitées aux arrêts suivants.
                        </p>
                      )}
                      <DestinationTiles
                        departure={departure}
                        arrivals={allArrivals}
                        selected={arrival}
                        onSelect={setArrival}
                        primaryColor={theme.primary}
                        showDepartureLabel
                      />
                    </section>

                    {/* Dates */}
                    {arrival && (
                      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-gray-400" /> Date de voyage
                        </h3>
                        <DateStrip
                          dates={availableDates}
                          selected={selectedDate}
                          hasTrips={(d) => trips.some((t) => t.date === d)}
                          onSelect={handleSelectDate}
                          primaryColor={theme.primary}
                        />
                      </section>
                    )}

                    {/* Time slots */}
                    {arrival && selectedDate && (
                      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                          <Clock4 className="w-3.5 h-3.5 text-gray-400" />
                          {isEscaleMode ? "Heure de passage à l'escale" : "Horaires disponibles"}
                        </h3>
                        <TimeSlotGrid
                          slots={filteredTrips}
                          selectedId={selectedTrip?.id ?? null}
                          onSelect={setSelectedTrip}
                          formatMoney={money}
                          primaryColor={theme.primary}
                        />
                      </section>
                    )}

                    {/* Recent sales */}
                    {tickets.length > 0 && (
                      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                        <h3 className="text-base font-bold text-gray-900 mb-3">Dernières ventes</h3>
                        <RecentSales
                          sales={tickets}
                          formatMoney={money}
                          primaryColor={theme.primary}
                          onResell={handleQuickResell}
                        />
                      </section>
                    )}
                  </div>

                  {/* RIGHT: Sale panel (2/5) — toujours visible, bouton Encaisser en bas */}
                  <div className="lg:col-span-2 flex flex-col min-h-0 lg:min-h-[calc(100vh-12rem)]">
                    <SalePanel
                      selectedTrip={selectedTrip}
                      canSell={canSell}
                      status={status}
                      nomClient={nomClient}
                      onNomChange={setNomClient}
                      telephone={telephone}
                      onTelChange={setTelephone}
                      placesAller={placesAller}
                      onPlacesAllerChange={setPlacesAller}
                      totalPrice={totalPrice}
                      canValidate={canValidateSale}
                      isProcessing={isProcessing}
                      onValidate={handleReservation}
                      formatMoney={money}
                      primaryColor={theme.primary}
                      secondaryColor={theme.secondary}
                      validationHint={validationHint}
                      activationByEscaleManager={agencyType === "escale"}
                      clientSuggestions={clientSuggestions}
                      tariffKey={tariffKey}
                      onTariffChange={setTariffKey}
                      tariffMultiplier={tariffMultiplier}
                      additionalPassengers={additionalPassengers}
                      onAdditionalPassengersChange={setAdditionalPassengers}
                    />
                  </div>
                </div>
              </div>
            )
          )}

          {/* ═══════ RAPPORT TAB ═══════ */}
          {tab === "rapport" && (
            <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-5">
              <SectionCard
                title="Rapport de session"
                right={
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={typography.valueLarge} style={{ color: theme.primary }}>{sessionTotals.billets} <span className={typography.muted}>billets</span></p>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div className="text-right">
                      <p className={typography.valueLarge} style={{ color: theme.primary }}>{money(sessionTotals.montant)}</p>
                    </div>
                  </div>
                }
              >
                <p className={typography.muted}>{reportDateLabel}</p>
              </SectionCard>

              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="Rechercher par code, nom, téléphone…"
                  className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition"
                  style={{ ["--tw-ring-color" as string]: `${theme.primary}40` }}
                />
              </div>

              {(status === "active" || status === "paused" || status === "pending") && (
                <SectionCard
                  title="Ventes du poste en cours"
                  right={<span className={typography.mutedSm}>Temps réel</span>}
                  noPad
                >
                  {loadingReport ? (
                    <div className="p-8 text-center text-gray-400">Chargement…</div>
                  ) : !filteredTickets.length ? (
                    <EmptyState message={reportSearch ? "Aucun résultat pour cette recherche." : "Aucune vente pour cette session."} />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50/60 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trajet</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Billets</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Montant</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Statut</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredTickets.map((t) => {
                            const canceled = t.statutEmbarquement === EMBARKMENT_STATUS.ANNULE || t.montant === 0;
                            const boarded = isBoarded(t);
                            return (
                              <tr key={t.id} className={`hover:bg-gray-50/50 transition-colors ${canceled ? "bg-red-50/40" : boarded ? "bg-emerald-50/40" : ""}`}>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-gray-900">{t.depart} → {t.arrivee}</p>
                                  <p className="text-xs text-gray-500">{t.heure} • {t.date}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-gray-900">{t.nomClient}</p>
                                  {t.telephone && <p className="text-xs text-gray-500">{t.telephone}</p>}
                                </td>
                                <td className="px-4 py-3 text-right">{(t.seatsGo || 0) + (t.seatsReturn || 0)}</td>
                                <td className="px-4 py-3 text-right font-medium">
                                  {canceled ? <span className="text-gray-400 line-through">{money(t.montant)}</span> : money(t.montant)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <StatusBadge status={canceled ? "danger" : boarded ? "success" : "info"}>
                                    {canceled ? "Annulé" : boarded ? "Embarqué" : "Actif"}
                                  </StatusBadge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {!canceled && !boarded && (
                                      <>
                                        <ActionButton size="icon" variant="ghost" onClick={() => openEdit(t)} title="Modifier" aria-label="Modifier">
                                          <Pencil className="w-3.5 h-3.5 text-gray-500" />
                                        </ActionButton>
                                        <ActionButton size="icon" variant="ghost" onClick={() => cancelReservation(t)} disabled={cancelingId === t.id} title="Annuler" aria-label="Annuler" className="hover:bg-red-50">
                                          {cancelingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                                        </ActionButton>
                                      </>
                                    )}
                                    <code className="text-[10px] text-gray-400 bg-gray-50 px-1 py-0.5 rounded">{t.referenceCode || t.id.slice(0, 8)}</code>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Pending reports */}
              <SectionCard title="Sessions en attente de validation" noPad>
                {loadingPending ? (
                  <div className="p-8 text-center text-gray-400">Chargement…</div>
                ) : pendingReports.length === 0 ? (
                  <div className="p-5"><EmptyState message="Aucune session en attente." /></div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {pendingReports.map((rep) => {
                      const start = rep.startAt?.toDate?.() ?? new Date();
                      const end = rep.endAt?.toDate?.() ?? new Date();
                      return (
                        <div key={rep.shiftId} className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">Session #{rep.shiftId.slice(0, 6)}</p>
                              <p className="text-xs text-gray-500">{start.toLocaleString("fr-FR")} — {end.toLocaleString("fr-FR")}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={rep.accountantValidated ? "success" : "warning"}>
                                Comptable {rep.accountantValidated ? "✓" : "…"}
                              </StatusBadge>
                              <StatusBadge status={rep.managerValidated ? "success" : "warning"}>
                                Chef {rep.managerValidated ? "✓" : "…"}
                              </StatusBadge>
                            </div>
                          </div>
                          {rep.details.length > 0 && (
                            <table className="w-full text-sm mt-2">
                              <thead className="bg-gray-50/60">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Trajet</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Billets</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Montant</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {rep.details.map((d, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 text-gray-700">{d.trajet}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{d.billets}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{money(d.montant)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
          )}

          {/* ═══════ HISTORIQUE TAB ═══════ */}
          {tab === "historique" && (
            <div className="max-w-[1600px] mx-auto p-4 lg:p-6 space-y-5">
              <SectionCard title="Historique des sessions validées">
                <p className={typography.muted}>{user?.displayName || user?.email || "—"} ({sellerCodeCached})</p>
              </SectionCard>
              <SectionCard title="Liste des sessions validées" noPad>
                {loadingHistory ? (
                  <div className="p-8 text-center text-gray-400">Chargement…</div>
                ) : historyReports.length === 0 ? (
                  <div className="p-5"><EmptyState message="Aucune session validée." /></div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {historyReports.map((rep) => {
                      const start = rep.startAt?.toDate?.() ?? new Date();
                      const end = rep.endAt?.toDate?.() ?? new Date();
                      return (
                        <div key={rep.shiftId} className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">Session #{rep.shiftId.slice(0, 6)} — {rep.billets} billets • {money(rep.montant)}</p>
                              <p className="text-xs text-gray-500">{start.toLocaleString("fr-FR")} → {end.toLocaleString("fr-FR")}</p>
                            </div>
                            <div className="flex gap-1.5">
                              <StatusBadge status="success">Comptable ✓</StatusBadge>
                              <StatusBadge status="success">Chef ✓</StatusBadge>
                            </div>
                          </div>
                          {rep.details.length > 0 && (
                            <table className="w-full text-sm mt-2">
                              <thead className="bg-gray-50/60">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Trajet</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Billets</th>
                                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Montant</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {rep.details.map((d, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 text-gray-700">{d.trajet}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{d.billets}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{money(d.montant)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal (with price verification) */}
      {editOpen && editTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border shadow-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Modifier la réservation</h3>
            <EditForm target={editTarget} saving={isSavingEdit} money={money} primaryColor={theme.primary} secondaryColor={theme.secondary}
              onSave={saveEdit} onClose={() => { setEditOpen(false); setEditTarget(null); }} />
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {showReceipt && receiptData && receiptCompany && (
        <ReceiptModal open={showReceipt} onClose={() => setShowReceipt(false)} reservation={receiptData} company={receiptCompany} />
      )}

      {/* Session summary modal */}
      <SessionSummaryModal
        open={showSummary}
        tickets={tickets}
        sessionStart={sessionStartedAt}
        sessionEnd={summaryEnd}
        userName={user?.displayName || user?.email || "—"}
        userCode={sellerCodeCached || staffCodeForSale}
        formatMoney={money}
        primaryColor={theme.primary}
        secondaryColor={theme.secondary}
        onPrint={() => window.print()}
        onClose={() => setShowSummary(false)}
      />
    </div>
  );
};

// ─── Inline Edit Form (with amount verification) ───
const EditForm: React.FC<{
  target: { id: string; nomClient: string; telephone?: string; seatsGo: number; seatsReturn?: number; montant: number; expectedPrice?: number };
  saving: boolean;
  money: (n: number) => string;
  primaryColor: string;
  secondaryColor: string;
  onSave: (p: any) => void;
  onClose: () => void;
}> = ({ target, saving, money: moneyFmt, primaryColor, secondaryColor, onSave, onClose }) => {
  const [nom, setNom] = useState(target.nomClient);
  const [tel, setTel] = useState(formatPhoneMaliDisplay(rawPhoneMali(target.telephone || "")) || (target.telephone || ""));
  const [sGo, setSGo] = useState(target.seatsGo);
  const [sRet, setSRet] = useState(target.seatsReturn || 0);
  const [amt, setAmt] = useState(target.montant);
  const [reason, setReason] = useState("");

  const expectedPrice = target.expectedPrice ?? target.montant;
  const priceDeviation = expectedPrice > 0 ? Math.abs(amt - expectedPrice) / expectedPrice : 0;
  const showPriceWarning = priceDeviation > 0.15 && amt !== expectedPrice;

  return (
    <div className="space-y-3">
      <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} onBlur={() => setNom(capitalizeFullName(nom))} />
      <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" placeholder="12 34 56 78" value={tel} onChange={(e) => setTel(formatPhoneMaliDisplay(rawPhoneMali(e.target.value)))} inputMode="numeric" maxLength={11} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Places Aller</label>
          <div className="flex">
            <button className="px-3 py-2 border rounded-l-xl bg-white hover:bg-gray-50" onClick={() => setSGo(Math.max(1, sGo - 1))}>-</button>
            <div className="flex-1 text-center font-bold py-2 border-y bg-gray-50">{sGo}</div>
            <button className="px-3 py-2 border rounded-r-xl bg-white hover:bg-gray-50" onClick={() => setSGo(sGo + 1)}>+</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Places Retour</label>
          <div className="flex">
            <button className="px-3 py-2 border rounded-l-xl bg-white hover:bg-gray-50" onClick={() => setSRet(Math.max(0, sRet - 1))}>-</button>
            <div className="flex-1 text-center font-bold py-2 border-y bg-gray-50">{sRet}</div>
            <button className="px-3 py-2 border rounded-r-xl bg-white hover:bg-gray-50" onClick={() => setSRet(sRet + 1)}>+</button>
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Montant</label>
        <input type="number" className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" value={amt} onChange={(e) => setAmt(Math.max(0, Number(e.target.value)))} />
        {showPriceWarning && (
          <div className="mt-1.5 flex items-center gap-1.5 text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
            <span className="text-xs font-medium">⚠ Écart de {Math.round(priceDeviation * 100)}% par rapport au montant attendu ({moneyFmt(expectedPrice)})</span>
          </div>
        )}
      </div>
      <input className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm" placeholder="Motif (optionnel)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex justify-end gap-2 pt-2">
        <ActionButton variant="secondary" onClick={onClose}>Annuler</ActionButton>
        <ActionButton disabled={saving || !nom} onClick={() => onSave({ id: target.id, nomClient: capitalizeFullName(nom), telephone: rawPhoneMali(tel) || tel, telephoneOriginal: tel.trim() || undefined, seatsGo: sGo, seatsReturn: sRet, montant: amt, editReason: reason || undefined })}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </ActionButton>
      </div>
    </div>
  );
};

export default AgenceGuichetPage;
