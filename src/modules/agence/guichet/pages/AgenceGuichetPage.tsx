// ===================================================================
// GUICHET POS — XXL REDESIGN v2
// Professional transport ticketing terminal with all 15 enhancements.
//
// Enhancements:
//   1. Quick-client autocomplete (ventes de la session active uniquement)
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
import { belongsToGuichetSession } from "@/modules/agence/guichet/guichetSessionReservationModel";
import {
  listTripInstancesByRouteAndDateRange,
} from "@/modules/compagnie/tripInstances/tripInstanceService";
import { agencyNomFromDoc, cityLabelFromAgencyDoc } from "@/modules/agence/lib/agencyDocCity";
import { getStopByOrder, getEscaleDestinations } from "@/modules/compagnie/routes/routeStopsService";
import { getDeviceFingerprint } from "@/utils/deviceFingerprint";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { agencyChromePageRootStyle } from "@/shared/theme/agencySurfaceGradients";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { makeShortCode } from "@/utils/brand";
import { canCompanyPerformAction } from "@/shared/subscription/restrictions";
import type { SubscriptionStatus } from "@/shared/subscription/types";

import ReceiptModal, {
  type ReservationData as ReceiptReservation,
  type CompanyData as ReceiptCompany,
} from "@/modules/agence/guichet/components/ReceiptModal";

import {
  PosSessionBar, DestinationTiles,
  SalePanel, RecentSales, ClosedOverlay, SuccessToast,
  SessionSummaryModal, TARIFF_OPTIONS, playSound, SALE_PENDING_UI_STATUT, SALE_SLOW_UI_STATUT, SALE_ERROR_UI_STATUT,
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
import { refundPayment } from "@/modules/compagnie/treasury/ledgerRefundService";
import { offlineStorageService } from "@/modules/offline/services/offlineStorageService";
import { getPersistentDeviceId } from "@/modules/offline/services/offlineIdentityService";
import { offlineSyncService } from "@/modules/offline/services/offlineSyncService";

// ─── Constants ───
/** Statuts réservation : convention canonique sans accent (Phase B). */
const RESERVATION_STATUS = { PAYE: "paye", ANNULE: "annule", CONFIRME: "confirme" } as const;
/** Statut embarquement (affichage UI, distinct de reservation.statut). */
const EMBARKMENT_STATUS = { EMBARQUE: "embarqué", ANNULE: "annulé" } as const;
const CANALS = { GUICHET: "guichet" } as const;
const SLOW_NETWORK_TIMEOUT_MS = 1000;

function reservationCreatedAtMs(createdAt: unknown): number {
  if (createdAt != null && typeof (createdAt as { toMillis?: () => number }).toMillis === "function") {
    return (createdAt as { toMillis: () => number }).toMillis();
  }
  return 0;
}

const DAYS_IN_ADVANCE = 8;
const DEFAULT_COMPANY_SLUG = "compagnie-par-defaut";

// ─── Types ───
type Trip = { id: string; date: string; time: string; departure: string; arrival: string; price: number; places: number; remainingSeats?: number; capacitySeats?: number; agencyId?: string };
type TicketRow = {
  id: string; referenceCode?: string; date: string; heure: string; depart: string; arrivee: string;
  nomClient: string; telephone?: string; seatsGo: number; seatsReturn?: number; montant: number;
  canal?: string; statutEmbarquement?: string; boardingStatus?: string; statut?: string; trajetId?: string; sessionId?: string;
  createdAt?: any; guichetierCode?: string;
};

const INVALID_RESERVATION_STATUT = "invalide";

/** Passager embarqué : boardingStatus prioritaire, fallback statutEmbarquement. */
function isBoarded(row: { boardingStatus?: string; statutEmbarquement?: string }): boolean {
  if ((row.boardingStatus ?? "").toLowerCase() === "boarded") return true;
  const s = (row.statutEmbarquement ?? "").toLowerCase();
  return s === "embarqué" || s === "embarque";
}

function mergeServerAndOptimisticTickets(server: TicketRow[], optimistic: TicketRow[]): TicketRow[] {
  const refs = new Set(server.map((t) => String(t.referenceCode ?? "").trim()).filter(Boolean));
  const extra = optimistic.filter((o) => {
    const r = String(o.referenceCode ?? "").trim();
    return !r || !refs.has(r);
  });
  const combined = [...server, ...extra];
  combined.sort((a, b) => reservationCreatedAtMs(a.createdAt) - reservationCreatedAtMs(b.createdAt));
  return combined;
}

function mapGuichetSaleError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/places|capacit|disponibles|Plus assez/i.test(msg)) return "Places indisponibles sur ce trajet.";
  if (/failed to fetch|network|offline|unavailable|client is offline/i.test(msg)) return "Erreur réseau. Réessayez.";
  if (/Poste|session|verrouill|appareil/i.test(msg)) return msg;
  return msg.length > 160 ? "Erreur lors de l’encaissement." : msg;
}

function isNetworkSaleError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|network|offline|unavailable|client is offline/i.test(msg);
}

function formatDateLongFR(dateStr: string): string {
  // dateStr attendu: YYYY-MM-DD
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const raw = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatDateShortFR(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const raw = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" }).format(d).replace(".", "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

type ShiftReport = {
  shiftId: string; userId: string; userName?: string; userCode?: string;
  startAt: Timestamp; endAt: Timestamp; billets: number; montant: number;
  details: { trajet: string; billets: number; montant: number; heures: string[] }[];
  accountantValidated: boolean; managerValidated: boolean;
};

// ─── Helpers : code guichetier depuis users root, sinon depuis Équipe (agence/users) ───
async function getSellerCode(
  uid?: string | null,
  companyId?: string | null,
  agencyId?: string | null
): Promise<string | null> {
  if (!uid) return null;
  try {
    const s = await getDoc(doc(db, "users", uid));
    if (s.exists()) {
      const u = s.data() as any;
      const code = u.staffCode || u.codeCourt || u.code || null;
      if (code) return code;
    }
    if (companyId && agencyId) {
      const usersRef = collection(db, "companies", companyId, "agences", agencyId, "users");
      const snap = await getDocs(query(usersRef, where("uid", "==", uid)));
      if (snap.docs.length > 0) {
        const d = snap.docs[0].data() as any;
        return d.agentCode || d.staffCode || d.codeCourt || d.code || null;
      }
    }
    return null;
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
  const rootChromeStyle = useMemo(
    () => agencyChromePageRootStyle(theme.primary, theme.secondary, darkMode),
    [theme.primary, theme.secondary, darkMode]
  );

  const locationState = (location.state || {}) as { fromEscale?: boolean; routeId?: string; stopOrder?: number; originEscaleCity?: string };
  const isEscaleMode = Boolean(locationState.fromEscale && locationState.routeId != null && locationState.stopOrder != null);

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
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [nomClient, setNomClient] = useState("");
  const [telephone, setTelephone] = useState("");
  const [placesAller, setPlacesAller] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  // ── Enhancement states ──
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrint, setAutoPrint] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [tariffKey, setTariffKey] = useState("plein");
  const [additionalPassengers, setAdditionalPassengers] = useState<Array<{ name: string; phone: string }>>([]);

  // ── Session summary (données du rapport de clôture = même source que "Sessions en attente de validation") ──
  const [showSummary, setShowSummary] = useState(false);
  const [summaryStart, setSummaryStart] = useState<Date | null>(null);
  const [summaryEnd, setSummaryEnd] = useState<Date | null>(null);
  const [summaryTickets, setSummaryTickets] = useState<Array<{ depart: string; arrivee: string; seatsGo: number; seatsReturn?: number; montant: number; statutEmbarquement?: string }>>([]);

  // ── Live session data ──
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  /** Ventes affichées avant la fin de la transaction Firestore (retirées au succès / échec). */
  const [optimisticSessionSales, setOptimisticSessionSales] = useState<TicketRow[]>([]);
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
  const canSell =
    status === "active" &&
    !!activeShift?.id &&
    !!user?.companyId &&
    !!user?.agencyId &&
    !sessionLockedByOtherDevice;
  const isCounterOpen = status === "active" || status === "paused";

  // ── Session start time for timer ──
  const sessionStartedAt = useMemo(() => {
    const raw = activeShift?.startAt ?? activeShift?.startTime;
    if (!raw) return null;
    return typeof raw.toDate === "function" ? raw.toDate() : new Date(raw as any);
  }, [activeShift?.startAt, activeShift?.startTime]);

  // ── Tariff multiplier ──
  const tariffMultiplier = TARIFF_OPTIONS.find((t) => t.key === tariffKey)?.multiplier ?? 1;

  const mergedSessionTickets = useMemo(
    () => mergeServerAndOptimisticTickets(tickets, optimisticSessionSales),
    [tickets, optimisticSessionSales]
  );

  // ── Client suggestions : session active + lignes optimistes en cours ──
  const clientSuggestions: ClientSuggestion[] = useMemo(() => {
    const map = new Map<string, ClientSuggestion>();
    for (const r of mergedSessionTickets) {
      if (!r.nomClient) continue;
      const key = r.nomClient.toLowerCase().trim();
      if (!map.has(key)) map.set(key, { name: r.nomClient, phone: r.telephone || "" });
    }
    return Array.from(map.values());
  }, [mergedSessionTickets]);

  const showToast = useCallback((msg: string, type: ToastType = "success") => {
    setSuccessMessage(msg);
    setToastType(type);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3500);
  }, []);

  /** Notification discrète si l’envoi en file d’attente échoue (pas de libellés techniques). */
  const lastCritSyncNotifyAtRef = useRef(0);
  const CRIT_SYNC_TOAST_MS = 90_000;

  useEffect(() => {
    offlineSyncService.start();
    const unsub = offlineSyncService.subscribe((summary) => {
      if (summary.running) return;
      if (summary.failed > 0 || summary.conflicted > 0) {
        const now = Date.now();
        if (now - lastCritSyncNotifyAtRef.current >= CRIT_SYNC_TOAST_MS) {
          lastCritSyncNotifyAtRef.current = now;
          showToast("Problème de synchronisation, veuillez réessayer", "error");
        }
      }
    });
    return () => unsub();
  }, [showToast]);

  const handleLogout = useCallback(async () => {
    try {
      if (typeof signOutSafe === "function") { await signOutSafe(); return; }
      if (typeof auth?.logout === "function") { await auth.logout(); return; }
      window.location.href = "/login";
    } catch { window.location.href = "/login"; }
  }, [signOutSafe, auth]);

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
          const sc = await getSellerCode(user.uid, user.companyId, user.agencyId);
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
        let departureCity = "";
        if (agSnap.exists()) {
          const a = agSnap.data() as Record<string, unknown>;
          const ville = cityLabelFromAgencyDoc(a);
          const nom = agencyNomFromDoc(a);
          departureCity = ville;
          setDeparture(ville);
          setAgencyMeta({
            name: nom || ville || "Agence",
            code: makeShortCode(nom || ville, a.code as string | undefined),
            phone: String(a.telephone ?? ""),
          });
          setAgencyType(String(a.type ?? ""));
        }
        if (!isEscaleMode || !locationState.routeId || locationState.stopOrder == null) {
          const today = new Date();
          const from = today.toISOString().split("T")[0];
          const to = new Date(today);
          to.setDate(today.getDate() + DAYS_IN_ADVANCE);
          const toYmd = to.toISOString().split("T")[0];
          const dep = departureCity.trim();
          let tripsForArrivals: any[] = [];
          if (dep) {
            const qArrivals = query(
              collection(db, `companies/${user.companyId}/tripInstances`),
              where("departureCity", "==", dep),
              where("date", ">=", from),
              where("date", "<=", toYmd),
              orderBy("date", "asc"),
              orderBy("departureTime", "asc"),
              limit(100)
            );
            tripsForArrivals = await getDocs(qArrivals)
              .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)))
              .catch(() => []);
          }
          // Fallback robuste: si aucune destination trouvée par ville de départ, basculer sur agencyId.
          if (tripsForArrivals.length === 0) {
            const qByAgency = query(
              collection(db, `companies/${user.companyId}/tripInstances`),
              where("agencyId", "==", user.agencyId),
              limit(200)
            );
            tripsForArrivals = await getDocs(qByAgency)
              .then((snap) =>
                snap.docs
                  .map((d) => ({ id: d.id, ...d.data() } as any))
                  .filter((ti) => {
                    const date = String((ti as any).date ?? "");
                    return date >= from && date <= toYmd;
                  })
              )
              .catch(() => []);
          }
          const arrivals = Array.from(
            new Set(
              tripsForArrivals
                .map((ti) => String((ti as any).arrivalCity ?? (ti as any).routeArrival ?? (ti as any).arrival ?? ""))
                .filter((a) => a && (!dep || a.toLowerCase() !== dep.toLowerCase()))
            )
          );
          setAllArrivals(arrivals);
          return;
        }
        const routeId = locationState.routeId;
        const stopOrder = Number(locationState.stopOrder);
        const originStop = await getStopByOrder(user.companyId, routeId, stopOrder);
        const destinations = await getEscaleDestinations(user.companyId, routeId, stopOrder);
        const originCity = originStop?.city ?? locationState.originEscaleCity ?? "";
        const destinationCities = destinations.map((s) => s.city).filter(Boolean);
        setDeparture(originCity);
        setAllArrivals(destinationCities);
        if (destinationCities.length > 0) setArrival(destinationCities[0]);
      } catch (e) { console.error("[GUICHET] init:error", e); }
    })();
  }, [user?.uid, user?.companyId, user?.agencyId, isEscaleMode, locationState.routeId, locationState.stopOrder, locationState.originEscaleCity]);

  // ═══════════════ TRIP SEARCH (source unique: tripInstances) ═══════════════
  const searchTrips = useCallback(async (dep: string, arr: string) => {
    setTrips([]);
    setSelectedTrip(null);
    if (!user?.companyId || !dep?.trim() || !arr?.trim()) return;

    const now = new Date();
    const dateFrom = now.toISOString().split("T")[0];
    const to = new Date(now);
    to.setDate(now.getDate() + DAYS_IN_ADVANCE);
    const dateTo = to.toISOString().split("T")[0];

    const instances = await listTripInstancesByRouteAndDateRange(
      user.companyId,
      dep.trim(),
      arr.trim(),
      dateFrom,
      dateTo,
      { limitCount: 100 }
    );

    const remainingFor = (ti: any) => {
      const direct = Number(ti?.remainingSeats);
      if (Number.isFinite(direct)) return direct;
      const capacity = Number(ti?.capacitySeats ?? ti?.seatCapacity ?? ti?.passengerCount ?? ti?.places ?? 0);
      const reserved = Number(ti?.reservedSeats ?? 0);
      return Math.max(0, capacity - reserved);
    };

    const out: Trip[] = instances
      .filter((ti) => String((ti as any).status ?? "").toLowerCase() !== "cancelled")
      .filter((ti) => remainingFor(ti) > 0)
      .map((ti) => ({
        id: ti.id,
        date: String((ti as any).date ?? ""),
        time: String((ti as any).departureTime ?? (ti as any).time ?? "00:00"),
        departure: String((ti as any).departureCity ?? (ti as any).departure ?? (ti as any).routeDeparture ?? dep),
        arrival: String((ti as any).arrivalCity ?? (ti as any).arrival ?? (ti as any).routeArrival ?? arr),
        price: Number((ti as any).price ?? 0),
        places: remainingFor(ti),
        remainingSeats: remainingFor(ti),
        capacitySeats: Number((ti as any).capacitySeats ?? (ti as any).seatCapacity ?? remainingFor(ti)),
        agencyId: String((ti as any).agencyId ?? ""),
      }));

    const nowTime = new Date();
    const filtered = out.filter((t) => {
      const tripDt = new Date(`${t.date}T${t.time}`);
      if (Number.isNaN(tripDt.getTime())) return true; // sécurité: ne pas masquer des cas inattendus
      return tripDt.getTime() >= nowTime.getTime();
    });

    setTrips(filtered);
    setSelectedDate(filtered[0]?.date ?? "");
    setSelectedTrip(filtered[0] ?? null);
  }, [user?.companyId]);

  const searchTripsRef = useRef(searchTrips);
  searchTripsRef.current = searchTrips;
  useEffect(() => {
    if (!arrival) { setTrips([]); setSelectedDate(""); setSelectedTrip(null); return; }
    searchTripsRef.current(departure, arrival);
  }, [arrival, departure]);

  // ═══════════════ QUICK-RESELL ═══════════════
  const handleQuickResell = useCallback((sale: SaleRow) => {
    if (!canSell) return;
    if (sale.statut === SALE_PENDING_UI_STATUT || sale.statut === SALE_SLOW_UI_STATUT || sale.statut === SALE_ERROR_UI_STATUT) return;
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

  const availableDates = [...new Set(trips.map((t) => String(t.date || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const now = new Date();
  const nowDate = now.toISOString().split("T")[0];
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const selectedTrips = trips
    .filter((t) => t.date === selectedDate)
    .filter((t) => !(t.date === nowDate && String(t.time || "") < nowTime));

  useEffect(() => {
    if (availableDates.length === 0) {
      if (selectedDate) setSelectedDate("");
      if (selectedTrip) setSelectedTrip(null);
      return;
    }
    if (!selectedDate || !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate, selectedTrip]);

  useEffect(() => {
    if (!selectedDate) return;
    const list = trips.filter((t) => t.date === selectedDate);
    if (list.length === 0) {
      setSelectedTrip(null);
      return;
    }
    if (!selectedTrip || selectedTrip.date !== selectedDate || !list.some((t) => t.id === selectedTrip.id)) {
      setSelectedTrip(list[0]);
    }
  }, [trips, selectedDate, selectedTrip]);

  // ═══════════════ RESERVATION ═══════════════
  const handleReservation = useCallback(async () => {
    if (!selectedTrip || !nomClient || !telephone) return;
    const normalizedName = capitalizeFullName(nomClient);
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
      if (!isOnline) {
        const offlineParams = {
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
          agencyTelephone: agencyMeta.phone ?? null, referenceCode: "", tripType: "aller_simple",
          tripInstanceId: selectedTrip.id,
          ...(tariffKey !== "plein" ? { tariff: tariffKey, tariffMultiplier } : {}),
          ...(additionalPassengers.length > 0
            ? {
                passengers: [
                  { name: normalizedName, phone: rawPhoneMali(telephone) },
                  ...additionalPassengers
                    .filter((p) => p.name.trim())
                    .map((p) => ({ name: capitalizeFullName(p.name), phone: rawPhoneMali(p.phone) })),
                ],
              }
            : {}),
        } as any;
        const deviceId = await getPersistentDeviceId();
        const transactionId = await offlineStorageService.generateTransactionId(deviceId);
        const referenceCode = `TX-${transactionId.slice(-10).toUpperCase()}`;
        const saved = await offlineStorageService.saveTransaction({
          transactionId,
          type: "guichet_sale",
          userId: user!.uid,
          deviceId,
          payload: {
            params: {
              ...offlineParams,
              referenceCode,
              idempotencyKey: transactionId,
              offlineMeta: {
                mode: "offline",
                transactionId,
                deviceId,
                createdAt: Date.now(),
              },
            },
            deviceFingerprint: getDeviceFingerprint(),
          },
        });
        setReceiptData({
          id: saved.transactionId, nomClient: normalizedName, telephone: rawPhoneMali(telephone) || telephone, date: selectedTrip.date, heure: selectedTrip.time,
          depart: selectedTrip.departure, arrivee: selectedTrip.arrival,
          seatsGo: placesAller, seatsReturn: 0,
          montant: totalPrice, statut: "en_attente_sync", paiement: "espèces",
          agencyNom: agencyMeta.name, agenceTelephone: agencyMeta.phone,
          createdAt: new Date(), referenceCode,
          guichetierCode: sellerCodeCached || staffCodeForSale || "GUEST",
        });
        setReceiptCompany({
          nom: companyMeta.name, logoUrl: companyMeta.logo || undefined,
          couleurPrimaire: theme.primary, couleurSecondaire: theme.secondary,
          slug: companyMeta.slug, telephone: companyMeta.phone || undefined,
        });
        setShowReceipt(true);
        setNomClient(""); setTelephone(""); setPlacesAller(1);
        setTariffKey("plein"); setAdditionalPassengers([]);
        showToast("Vente enregistrée hors ligne.");
        if (soundEnabled) playSound("success");
        return;
      }

      let referenceCode: string;
      try {
        referenceCode = await generateRef({
          companyId: user!.companyId, companyCode: companyMeta.code,
          agencyId: user!.agencyId, agencyCode: agencyMeta.code,
          tripInstanceId: selectedTrip.id, sellerCode: sellerCodeCached || staffCodeForSale,
        });
      } catch (e) {
        console.error("[GUICHET] generateRef:error", e);
        showToast("Impossible de générer la référence billet.", "error");
        if (soundEnabled) playSound("error");
        return;
      }

      const passengersField = additionalPassengers.length > 0
        ? [{ name: normalizedName, phone: rawPhoneMali(telephone) }, ...additionalPassengers.filter((p) => p.name.trim()).map((p) => ({ name: capitalizeFullName(p.name), phone: rawPhoneMali(p.phone) }))]
        : undefined;

      const tempId = `opt_${crypto.randomUUID()}`;
      const phoneDisp = rawPhoneMali(telephone) || telephone;
      const guichetCode = sellerCodeCached || staffCodeForSale || "GUEST";
      const optimisticRow: TicketRow = {
        id: tempId,
        referenceCode,
        date: selectedTrip.date,
        heure: selectedTrip.time,
        depart: selectedTrip.departure,
        arrivee: selectedTrip.arrival,
        nomClient: normalizedName,
        telephone: phoneDisp,
        seatsGo: placesAller,
        seatsReturn: 0,
        montant: totalPrice,
        canal: CANALS.GUICHET,
        statutEmbarquement: "en_attente",
        boardingStatus: "pending",
        statut: SALE_PENDING_UI_STATUT,
        trajetId: selectedTrip.id,
        sessionId: activeShift!.id,
        createdAt: Timestamp.now(),
        guichetierCode: guichetCode,
      };

      setOptimisticSessionSales((p) => [...p, optimisticRow]);
      setReceiptCompany({
        nom: companyMeta.name, logoUrl: companyMeta.logo || undefined,
        couleurPrimaire: theme.primary, couleurSecondaire: theme.secondary,
        slug: companyMeta.slug, telephone: companyMeta.phone || undefined,
      });
      setReceiptData({
        id: tempId,
        nomClient: normalizedName,
        telephone: phoneDisp,
        date: selectedTrip.date,
        heure: selectedTrip.time,
        depart: selectedTrip.departure,
        arrivee: selectedTrip.arrival,
        seatsGo: placesAller,
        seatsReturn: 0,
        montant: totalPrice,
        statut: SALE_PENDING_UI_STATUT,
        paiement: "espèces",
        agencyNom: agencyMeta.name,
        agenceTelephone: agencyMeta.phone,
        createdAt: new Date(),
        referenceCode,
        guichetierCode: guichetCode,
      });
      setShowReceipt(true);

      const saleIdempotencyKey = crypto.randomUUID();
      let attempt = 0;
      let shouldRetry = false;
      while (true) {
        const slowTimer = window.setTimeout(() => {
          setOptimisticSessionSales((p) => p.map((x) => (x.id === tempId ? { ...x, statut: SALE_SLOW_UI_STATUT } : x)));
          setReceiptData((prev) => (prev && prev.id === tempId ? { ...prev, statut: SALE_SLOW_UI_STATUT } : prev));
        }, SLOW_NETWORK_TIMEOUT_MS);
        try {
          setOptimisticSessionSales((p) => p.map((x) => (x.id === tempId ? { ...x, statut: SALE_PENDING_UI_STATUT } : x)));
          setReceiptData((prev) => (prev && prev.id === tempId ? { ...prev, statut: SALE_PENDING_UI_STATUT } : prev));
          const newId = await createGuichetReservation({
            companyId: user!.companyId, agencyId: user!.agencyId, userId: user!.uid,
            sessionId: activeShift!.id,
            idempotencyKey: saleIdempotencyKey,
            userCode: sellerCodeCached || staffCodeForSale,
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
            offlineMeta: { mode: "online" },
            ...(tariffKey !== "plein" ? { tariff: tariffKey, tariffMultiplier } : {}),
            ...(passengersField ? { passengers: passengersField } : {}),
          } as any, { deviceFingerprint: getDeviceFingerprint() });
          window.clearTimeout(slowTimer);

          setOptimisticSessionSales((p) => p.filter((x) => x.id !== tempId));
          setReceiptData((prev) =>
            prev && prev.id === tempId
              ? { ...prev, id: newId, statut: RESERVATION_STATUS.PAYE }
              : prev
          );
          const msg = `Réservation confirmée — ${normalizedName} • ${placesAller} place(s) • ${money(totalPrice)}`;
          showToast(msg);
          if (soundEnabled) playSound("success");
          if (autoPrint) setTimeout(() => window.print(), 500);
          // Mise à jour immédiate UI des places restantes (sans refresh).
          setTrips((prev) =>
            prev.map((trip) => {
              if (trip.id !== selectedTrip.id) return trip;
              const nextRemaining = Math.max(0, Number(trip.remainingSeats ?? 0) - placesAller);
              return {
                ...trip,
                remainingSeats: nextRemaining,
                places: nextRemaining,
              };
            })
          );
          setSelectedTrip((prev) => {
            if (!prev || prev.id !== selectedTrip.id) return prev;
            const nextRemaining = Math.max(0, Number(prev.remainingSeats ?? 0) - placesAller);
            return {
              ...prev,
              remainingSeats: nextRemaining,
              places: nextRemaining,
            };
          });
          setNomClient(""); setTelephone(""); setPlacesAller(1);
          setTariffKey("plein"); setAdditionalPassengers([]);
          break;
        } catch (e) {
          window.clearTimeout(slowTimer);
          console.error("[GUICHET] reservation:error", e);
          const isNetErr = isNetworkSaleError(e);
          setOptimisticSessionSales((p) => p.map((x) => (x.id === tempId ? { ...x, statut: SALE_ERROR_UI_STATUT } : x)));
          setReceiptData((prev) => (prev && prev.id === tempId ? { ...prev, statut: SALE_ERROR_UI_STATUT } : prev));

          if (isNetErr && attempt < 1) {
            shouldRetry = window.confirm("Erreur réseau. Réessayer automatiquement ?");
          } else {
            shouldRetry = false;
          }
          if (shouldRetry) {
            attempt += 1;
            await new Promise((r) => window.setTimeout(r, 700));
            continue;
          }

          setOptimisticSessionSales((p) => p.filter((x) => x.id !== tempId));
          setShowReceipt(false);
          setReceiptData(null);
          showToast(mapGuichetSaleError(e), "error");
          if (soundEnabled) playSound("error");
          break;
        }
      }
    } catch (e) {
      console.error("[GUICHET] reservation:error", e);
      showToast("Erreur lors de la réservation.", "error");
      if (soundEnabled) playSound("error");
    } finally {
      setIsProcessing(false);
    }
  }, [selectedTrip, nomClient, telephone, canSell, placesAller, totalPrice, user, activeShift, companyMeta, agencyMeta, sellerCodeCached, staffCodeForSale, theme, company, sessionLockedByOtherDevice, soundEnabled, money, isOnline, showToast, autoPrint, tariffKey, tariffMultiplier, additionalPassengers]);

  // ═══════════════ CANCEL / EDIT ═══════════════
  const cancelReservation = useCallback(async (row: TicketRow) => {
    if (!user?.companyId || !user?.agencyId) return;
    if (row.statut === SALE_PENDING_UI_STATUT || row.statut === SALE_SLOW_UI_STATUT || row.statut === SALE_ERROR_UI_STATUT) return;
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
      setTickets((prev) => prev.map((t) => t.id === row.id ? { ...t, montant: 0, statut: "annulation_en_attente", statutEmbarquement: EMBARKMENT_STATUS.ANNULE } : t));
      if (soundEnabled) playSound("error");
      const refundAmount = Number(row.montant ?? 0) || 0;
      if (refundAmount > 0) {
        // Do not block UI on refund ledger sync after reservation cancellation.
        void (async () => {
          try {
            const txSnap = await getDocs(query(
              collection(db, "companies", user.companyId, "financialTransactions"),
              where("type", "==", "payment_received"),
              where("reservationId", "==", row.id),
              limit(1)
            ));
            if (!txSnap.empty) {
              const txId = txSnap.docs[0].id;
              await refundPayment({
                companyId: user.companyId,
                agencyId: user.agencyId,
                originalTransactionId: txId,
                channel: "cash",
                reason: reason.trim() || "Annulation guichet",
                performedBy: {
                  uid: user.uid,
                  name: user.displayName || user.email || null,
                  role: (user as { role?: string })?.role ?? "guichetier",
                },
              });
            }
          } catch (e) {
            console.error("[GUICHET] ledger refund failed:", e);
          }
        })();
      }
    } catch {
      alert("Échec de l'annulation.");
    }
    finally { setCancelingId(null); }
  }, [user?.companyId, user?.agencyId, user?.uid, user?.displayName, user?.email, sellerCodeCached, money, soundEnabled]);

  const openEdit = useCallback((row: TicketRow) => {
    if (row.statut === SALE_PENDING_UI_STATUT || row.statut === SALE_SLOW_UI_STATUT || row.statut === SALE_ERROR_UI_STATUT) return;
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

  // ═══════════════ Réservations guichet : session active uniquement (pas de listener global agence) ═══════════════
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId) {
      setTickets([]);
      return;
    }
    if (!activeShift?.id) {
      setTickets([]);
      return;
    }
    if (!(status === "active" || status === "paused" || status === "pending")) {
      setTickets([]);
      return;
    }

    setLoadingReport(true);
    const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
    const q = query(
      rRef,
      where("sessionId", "==", activeShift.id),
      where("canal", "==", CANALS.GUICHET),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const agentId = String(user?.uid ?? "");
        const rows: TicketRow[] = snap.docs
          .filter((d) =>
            belongsToGuichetSession(d.data() as Record<string, unknown>, activeShift.id, agentId)
          )
          .map((d) => {
          const r = d.data() as any;
          return {
            id: d.id,
            referenceCode: r.referenceCode,
            date: r.date,
            heure: r.heure,
            depart: r.depart,
            arrivee: r.arrivee,
            nomClient: r.nomClient,
            telephone: r.telephone,
            seatsGo: r.seatsGo || 1,
            seatsReturn: r.seatsReturn || 0,
            montant: r.montant || 0,
            canal: r.canal,
            statutEmbarquement: r.statutEmbarquement,
            boardingStatus: r.boardingStatus,
            statut: r.statut,
            trajetId: r.trajetId,
            sessionId: r.sessionId,
            createdAt: r.createdAt,
            guichetierCode: r.guichetierCode || "",
          };
        });
        setTickets(rows);
        setLoadingReport(false);
      },
      (err) => {
        console.error("[GUICHET] report listener error", err);
        setLoadingReport(false);
      }
    );

    return () => unsub();
  }, [user?.companyId, user?.agencyId, user?.uid, activeShift?.id, status]);

  useEffect(() => {
    setOptimisticSessionSales([]);
  }, [activeShift?.id]);

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
    for (const t of mergedSessionTickets) {
      const isInvalid = String(t.statut ?? "").toLowerCase() === INVALID_RESERVATION_STATUT;
      if (isInvalid || t.statutEmbarquement === EMBARKMENT_STATUS.ANNULE || t.montant === 0) continue;
      billets += (t.seatsGo || 0) + (t.seatsReturn || 0);
      montant += t.montant || 0;
    }
    return { billets, montant };
  }, [mergedSessionTickets]);

  const reportDateLabel = useMemo(() => {
    const start = activeShift?.startAt?.toDate?.() || activeShift?.startTime?.toDate?.();
    if (!start) return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }, [activeShift?.startAt, activeShift?.startTime]);

  // ── Filtered tickets for search ──
  const filteredTickets = useMemo(() => {
    if (!reportSearch.trim()) return mergedSessionTickets;
    const q = reportSearch.toLowerCase();
    return mergedSessionTickets.filter((t) =>
      (t.referenceCode || "").toLowerCase().includes(q) ||
      t.nomClient.toLowerCase().includes(q) ||
      (t.telephone || "").includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }, [mergedSessionTickets, reportSearch]);

  // ═══════════════ SESSION CLOSE WITH SUMMARY ═══════════════
  /** Convertit les détails du rapport de clôture (même source que "Sessions en attente de validation") en lignes pour le popup. */
  const detailsToSummaryRows = useCallback((details: { trajet: string; billets: number; montant: number }[]) => {
    return (details || []).map((d) => {
      const [depart = "", arrivee = ""] = String(d.trajet || "").split("→");
      return {
        depart: depart.trim(),
        arrivee: arrivee.trim(),
        seatsGo: d.billets ?? 0,
        seatsReturn: 0,
        montant: d.montant ?? 0,
      };
    });
  }, []);

  const handleSessionClose = useCallback(async () => {
    const startTime = sessionStartedAt ?? null;
    try {
      const expected = Number(sessionTotals.montant || 0);
      const input = window.prompt("Montant reel en caisse pour cloturer la session :", String(expected));
      if (input == null) return;
      const normalized = Number(String(input).replace(",", "."));
      if (!Number.isFinite(normalized) || normalized < 0) {
        alert("Montant reel invalide.");
        return;
      }
      const result = await closeShift(normalized);
      setSummaryStart(startTime);
      setSummaryEnd(new Date());
      if (result) {
        setSummaryTickets(detailsToSummaryRows(result.details));
      } else {
        setSummaryTickets([]);
      }
      setShowSummary(true);
      if (soundEnabled) playSound("close");
      handleTabChange("rapport");
    } catch (e: any) { alert(e?.message || "Erreur"); }
  }, [closeShift, detailsToSummaryRows, soundEnabled, handleTabChange, sessionStartedAt, sessionTotals.montant]);

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div
      className={`h-screen flex flex-col overflow-hidden ${darkMode ? "agency-dark" : ""}`}
      style={rootChromeStyle}
    >

      {/* Toast */}
      <SuccessToast message={successMessage} visible={toastVisible} primaryColor={theme.primary} type={toastType} />

      {/* Session top bar */}
      <PosSessionBar
        status={status}
        locked={sessionLockedByOtherDevice}
        userName={user?.displayName || user?.email || "—"}
        userCode={sellerCodeCached || staffCodeForSale || "GUEST"}
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
        onPause={() => {
          const reason = window.prompt("Motif de la pause (obligatoire) :");
          if (reason === null) return;
          const trimmed = String(reason).trim();
          if (!trimmed) {
            alert("Le motif de pause est obligatoire.");
            return;
          }
          void pauseShift(trimmed).catch((e: any) => alert(e?.message || "Erreur"));
        }}
        onContinue={() => continueShift().catch((e: any) => alert(e?.message || "Erreur"))}
        onClose={handleSessionClose}
        onRefresh={() => refresh().catch(() => {})}
        onLogout={handleLogout}
      />

      {/* Tab navigation */}
      <div
        className="border-b border-gray-200/60 px-4 lg:px-6"
        style={{ backgroundImage: "var(--agency-gradient-subheader)" }}
      >
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
              <div className="max-w-[1600px] mx-auto p-3 md:p-4 lg:p-6 h-full flex flex-col min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 lg:gap-5 flex-1 min-h-0 w-full overflow-x-hidden">
                  {/* LEFT: Journey selection (3/5) — scroll si besoin */}
                  <div className="md:col-span-1 lg:col-span-2 xl:col-span-3 space-y-3 md:space-y-4 lg:space-y-4 overflow-visible md:overflow-y-auto min-h-0 min-w-0">
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

                    {/* Time slots */}
                    {arrival && (
                      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
                          <Clock4 className="w-3.5 h-3.5 text-gray-400" />
                          {isEscaleMode ? "Trajets disponibles" : "Horaires disponibles"}
                        </h3>
                        {availableDates.length === 0 ? (
                          <div className="py-4 text-center text-xs text-gray-400">Aucun horaire disponible.</div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex gap-1.5 overflow-x-auto">
                              {availableDates.map((d) => {
                                const active = d === selectedDate;
                                return (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => setSelectedDate(d)}
                                    className="flex-shrink-0 rounded-lg border px-2 py-1 text-xs font-medium transition"
                                    style={{
                                      borderColor: active ? theme.primary : "#e5e7eb",
                                      backgroundColor: active ? `${theme.primary}12` : "#fff",
                                      color: active ? theme.primary : "#374151",
                                    }}
                                  >
                                    {formatDateShortFR(d)}
                                  </button>
                                );
                              })}
                            </div>

                            <p className="text-xs font-semibold text-gray-700">
                              {formatDateLongFR(selectedDate)}
                            </p>

                            {selectedTrips.length === 0 ? (
                              <div className="py-3 text-center text-xs text-gray-400">Aucun horaire disponible.</div>
                            ) : (
                              <div
                                className="grid gap-1.5"
                                style={{ gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))" }}
                              >
                                {selectedTrips.map((t) => {
                                const active = selectedTrip?.id === t.id;
                                const remaining = Math.max(0, Number(t.remainingSeats ?? 0));
                                const capacity = Math.max(1, Number(t.capacitySeats ?? t.places ?? remaining));
                                const ratio = remaining / capacity;
                                const color = ratio > 0.6 ? "#16a34a" : ratio > 0.3 ? "#f59e0b" : "#dc2626";
                                const disabled = remaining <= 0;
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelectedTrip(t)}
                                    disabled={disabled}
                                    className="rounded-lg border px-2 py-1 text-left transition disabled:cursor-not-allowed disabled:bg-gray-100 disabled:border-gray-200"
                                    style={{
                                      borderColor: active ? theme.primary : "#e5e7eb",
                                      backgroundColor: active ? `${theme.primary}14` : "#fff",
                                    }}
                                  >
                                    <p className="flex items-center gap-1 leading-none">
                                      <span
                                        className="text-sm font-bold"
                                        style={{ color: active ? theme.primary : "#111827" }}
                                      >
                                        {t.time}
                                      </span>
                                      <span
                                        className="text-[11px] font-medium"
                                        style={{ color: disabled ? "#9ca3af" : color }}
                                      >
                                        {disabled ? "•complet" : `•${remaining}`}
                                      </span>
                                    </p>
                                  </button>
                                );
                              })}
                              </div>
                            )}
                          </div>
                        )}
                      </section>
                    )}

                  </div>

                  {/* RIGHT: Sale panel (2/5) — toujours visible, bouton Encaisser en bas */}
                  <div className="md:col-span-1 lg:col-span-1 xl:col-span-1 flex flex-col min-h-0 min-w-0">
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
            <div className="max-w-[1600px] mx-auto p-3 md:p-4 lg:p-6 space-y-3 md:space-y-4 lg:space-y-5">
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
                            const invalid = String(t.statut ?? "").toLowerCase() === INVALID_RESERVATION_STATUT;
                            const boarded = isBoarded(t);
                            const pendingEnc = t.statut === SALE_PENDING_UI_STATUT;
                            const slowEnc = t.statut === SALE_SLOW_UI_STATUT;
                            const errorEnc = t.statut === SALE_ERROR_UI_STATUT;
                            return (
                              <tr key={t.id} className={`hover:bg-gray-50/50 transition-colors ${errorEnc ? "bg-red-50/60" : (pendingEnc || slowEnc) ? "bg-amber-50/50" : invalid ? "bg-amber-50/60" : canceled ? "bg-red-50/40" : boarded ? "bg-emerald-50/40" : ""}`}>
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
                                  <StatusBadge status={errorEnc ? "danger" : (pendingEnc || slowEnc) ? "warning" : invalid ? "warning" : canceled ? "danger" : boarded ? "success" : "info"}>
                                    {errorEnc ? "Erreur"
                                      : (pendingEnc || slowEnc) ? "En attente"
                                      : invalid ? "Réservation invalide"
                                      : canceled ? "Annulé"
                                      : boarded ? "Embarqué"
                                      : "Actif"}
                                  </StatusBadge>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {!canceled && !boarded && !pendingEnc && !slowEnc && !errorEnc && (
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
                  <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                    {pendingReports.map((rep) => {
                      const start = rep.startAt?.toDate?.() ?? new Date();
                      const end = rep.endAt?.toDate?.() ?? new Date();
                      return (
                        <div key={rep.shiftId} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">Session billetterie</p>
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
                            <table className="w-full text-sm mt-2 overflow-hidden rounded-xl border border-gray-100">
                              <thead className="bg-gray-50/70">
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
            <div className="max-w-[1600px] mx-auto p-3 md:p-4 lg:p-6 space-y-3 md:space-y-4 lg:space-y-5">
              <SectionCard title="Historique des sessions validées">
                <p className={typography.muted}>{user?.displayName || user?.email || "—"} ({(sellerCodeCached || staffCodeForSale || "GUEST")})</p>
              </SectionCard>
              <SectionCard title="Liste des sessions validées" noPad>
                {loadingHistory ? (
                  <div className="p-8 text-center text-gray-400">Chargement…</div>
                ) : historyReports.length === 0 ? (
                  <div className="p-5"><EmptyState message="Aucune session validée." /></div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                    {historyReports.map((rep) => {
                      const start = rep.startAt?.toDate?.() ?? new Date();
                      const end = rep.endAt?.toDate?.() ?? new Date();
                      return (
                        <div key={rep.shiftId} className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold text-gray-900">Session validée — {rep.billets} billets • {money(rep.montant)}</p>
                              <p className="text-xs text-gray-500">{start.toLocaleString("fr-FR")} → {end.toLocaleString("fr-FR")}</p>
                            </div>
                            <div className="flex gap-1.5">
                              <StatusBadge status="success">Comptable ✓</StatusBadge>
                              <StatusBadge status="success">Chef ✓</StatusBadge>
                            </div>
                          </div>
                          {rep.details.length > 0 && (
                            <table className="w-full text-sm mt-2 overflow-hidden rounded-xl border border-gray-100">
                              <thead className="bg-gray-50/70">
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
        tickets={showSummary ? summaryTickets : tickets}
        sessionStart={showSummary ? summaryStart : sessionStartedAt}
        sessionEnd={showSummary ? summaryEnd : null}
        userName={user?.displayName || user?.email || "—"}
        userCode={sellerCodeCached || staffCodeForSale || "GUEST"}
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
