// CourierCreateShipmentPage — Envoi terrain : mode création (formulaire seul) OU mode ticket (après enregistrement), jamais les deux.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { shipmentsRef, shipmentRef } from "@/modules/logistics/domain/firestorePaths";
import { createShipment, type CreateShipmentParams } from "@/modules/logistics/services/createShipment";
import { updateCreatedShipment } from "@/modules/logistics/services/updateCreatedShipment";
import { recordShipmentEvent } from "@/modules/logistics/services/recordShipmentEvent";
import { makeShortCode } from "@/utils/brand";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { useFormatCurrency, useCurrencySymbol } from "@/shared/currency/CurrencyContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import type { Company } from "@/types/companyTypes";
import { formatProvisionalCourierShipmentNumber } from "@/modules/logistics/utils/courierShipmentReferencePrefix";
import { CourierPrintCombined } from "../components/CourierPrintCombined";
import { readCourierPrintPaper, writeCourierPrintMode, type CourierPrintPaper } from "../utils/courierPrintPreferences";
import { printCourierRootInIframe, printCourierRootInNewWindow } from "../utils/courierDomPrint";
import type { TripInstanceDocWithId } from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import { tripInstanceRemainingFromDoc, tripInstanceTime } from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import { agencyNomFromDoc, cityLabelFromAgencyDoc } from "@/modules/agence/lib/agencyDocCity";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import {
  getPhoneRuleFromCountry,
  isValidLocalPhone,
  sanitizeLocalPhone,
  type PhoneCountryRule,
} from "@/utils/phoneCountryRules";
import { User, UserRoundCheck } from "lucide-react";
import { useCourierWorkspace } from "../context/CourierWorkspaceContext";
import { decrementParcelCount } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { buildPublicTrackWebUrl } from "@/modules/logistics/utils/shipmentTrackingCrypto";
import { ensureShipmentTracking } from "@/modules/logistics/services/ensureShipmentTracking";
import { cn } from "@/lib/utils";
import { offlineStorageService } from "@/modules/offline/services/offlineStorageService";
import { getPersistentDeviceId } from "@/modules/offline/services/offlineIdentityService";
import { offlineSyncService } from "@/modules/offline/services/offlineSyncService";
import { useOperationQuotaStatus } from "@/core/hooks/useOperationQuotaStatus";
import {
  buildTripInstanceId,
  listTripInstancesByRouteAndDateRange,
} from "@/modules/compagnie/tripInstances/tripInstanceService";
import { normalizeTripInstanceTime } from "@/modules/compagnie/tripInstances/generateTripInstancesFromWeeklyTrips";
import {
  OPERATION_QUOTA_BLOCKED_HELP,
  OPERATION_QUOTA_BLOCKED_MESSAGE,
  OPERATION_QUOTA_WARNING_MESSAGE,
  operationQuotaErrorMessage,
} from "@/core/subscription/operationQuota";
import { toast } from "sonner";
import "dayjs/locale/fr";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("fr");

const BAMAKO_TZ = "Africa/Bamako";
const DAYS_IN_ADVANCE = 8;

const MAX_PHONE_SUGGESTIONS = 5;
const RECENT_SHIPMENTS_LIMIT = 50;
const COURIER_RAPID_CHAIN_LS = "teliya_courier_rapid_chain";
const COURIER_TRIP_UNAVAILABLE =
  "Ce départ n'est plus disponible. Choisissez un autre horaire.";

function normalizeCityKey(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Lettres (dont accentuées courantes), espaces, tirets — voir /^[A-Za-zÀ-ÿ\s-]*$/. */
function sanitizeNatureColisInput(raw: string): string {
  return String(raw ?? "").replace(/[^A-Za-zÀ-ÿ\s-]/g, "");
}

/** Compat ancienne donnée : découpe uniquement au chargement des envois existants. */
function splitPersonName(full: string): { prenom: string; nom: string } {
  const t = String(full ?? "").trim();
  if (!t) return { prenom: "", nom: "" };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { prenom: parts[0]!, nom: "" };
  return { prenom: parts[0]!, nom: parts.slice(1).join(" ") };
}

function applyFullNameFromSuggestion(setFullName: (v: string) => void, name: string, fallbackName: string) {
  const raw = String(name ?? "").trim();
  if (!raw) {
    setFullName(fallbackName);
    return;
  }
  setFullName(toNameCase(raw));
}

const inpGuichet =
  "min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 ring-offset-0 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 sm:min-h-10 sm:text-sm";

const personRowGrid = "grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.45fr)] sm:items-end";
const lblGuichet = "mb-1 block text-xs font-medium leading-tight text-gray-600 dark:text-gray-400";
const formSection =
  "min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900";

function tsMs(value: unknown): number {
  if (value == null) return 0;
  const t = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  return 0;
}

function isPastDepartureTime(dateISO: string, hhmm: string): boolean {
  const today = getTodayBamako();
  if (dateISO !== today) return false;
  const t = String(hhmm ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return false;
  const inst = dayjs.tz(
    `${dateISO}T${String(Number(m[1])).padStart(2, "0")}:${String(Number(m[2])).padStart(2, "0")}:00`,
    BAMAKO_TZ
  );
  return inst.isBefore(dayjs().tz(BAMAKO_TZ));
}

function departureSlotLabel(ti: TripInstanceDocWithId): string {
  const t = String(ti.departureTime ?? "").trim();
  if (!t) return "—";
  if (/^\d{1,2}:\d{2}/.test(t)) return t.slice(0, 5);
  return t;
}

/**
 * Places « vendables » pour filtrage courrier (tolère les fiches trajet sans capacité déclarée,
 * comme le guichet : remainingSeats explicite, sinon capacité − réservé).
 */
function seatsLeftForCourierGate(data: Record<string, unknown>): number {
  const rawRem = data.remainingSeats;
  if (rawRem != null && rawRem !== "") {
    const n = Number(rawRem);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  const capacity = Number(data.capacitySeats ?? data.seatCapacity ?? data.capacity ?? data.places ?? 0);
  const reserved = Number(data.reservedSeats ?? 0);
  if (capacity > 0) return Math.max(0, capacity - reserved);
  return Math.max(0, tripInstanceRemainingFromDoc(data as Parameters<typeof tripInstanceRemainingFromDoc>[0]));
}

/** Sièges + capacité colis (sans affichage UI) : peut-on encore charger un colis sur ce départ ? */
function tripAcceptsOneMoreParcelFromDoc(data: Record<string, unknown>): boolean {
  if (String(data.status ?? "").toLowerCase() === "cancelled") return false;
  const seatsLeft = seatsLeftForCourierGate(data);
  if (!Number.isFinite(seatsLeft) || seatsLeft <= 0) return false;
  const capP = Number(data.capacityParcels ?? 0);
  if (capP > 0) {
    const pc = Number(data.parcelCount ?? 0);
    if (pc >= capP) return false;
  }
  return true;
}

function tripAcceptsOneMoreParcel(ti: TripInstanceDocWithId): boolean {
  return tripAcceptsOneMoreParcelFromDoc(ti as unknown as Record<string, unknown>);
}

/** Date courte type « Sam 28 » (sans année, sans ISO). */
function formatDateChipFr(dateYmd: string): string {
  const d = dayjs.tz(`${dateYmd}T12:00:00`, BAMAKO_TZ).locale("fr");
  const s = d.format("ddd D");
  const trimmed = s.replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const chipScrollRow = "flex flex-wrap gap-2 pb-1";
const chipBase =
  "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

function toNameCase(value: string): string {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

type CourierWeeklyTripDoc = {
  active?: boolean;
  agencyId?: string | null;
  departure?: string;
  arrival?: string;
  departureCity?: string;
  arrivalCity?: string;
  price?: number;
  places?: number;
  seats?: number;
  horaires?: Record<string, string[]>;
  routeId?: string | null;
};

function weeklyTripHoursForDay(horaires: CourierWeeklyTripDoc["horaires"], dayName: string): string[] {
  if (!horaires) return [];
  const direct = horaires[dayName];
  if (Array.isArray(direct)) return direct;
  const dayKey = normalizeCityKey(dayName);
  const found = Object.entries(horaires).find(([key]) => normalizeCityKey(key) === dayKey);
  return Array.isArray(found?.[1]) ? found[1] : [];
}

function agencyMatchesRouteCity(agency: { ville: string; nom: string }, routeCity: string): boolean {
  const routeKey = normalizeCityKey(routeCity);
  if (!routeKey) return false;
  const cityKey = normalizeCityKey(agency.ville);
  const nameKey = normalizeCityKey(agency.nom);
  if (cityKey === routeKey || nameKey === routeKey) return true;
  return (!!cityKey && (cityKey.includes(routeKey) || routeKey.includes(cityKey))) ||
    (!!nameKey && (nameKey.includes(routeKey) || routeKey.includes(nameKey)));
}

async function listCourierTripsFromGuichetSource(params: {
  companyId: string;
  agencyId: string;
  departureCity: string;
  arrivalCity: string;
  dates: string[];
}): Promise<TripInstanceDocWithId[]> {
  const { companyId, agencyId, departureCity, arrivalCity, dates } = params;
  const dep = departureCity.trim();
  const arr = arrivalCity.trim();
  if (!companyId || !agencyId || !dep || !arr || dates.length === 0) return [];

  const wtSnap = await getDocs(collection(db, "companies", companyId, "agences", agencyId, "weeklyTrips"));
  const weeklyRows = wtSnap.docs
    .map((d) => ({ id: d.id, data: d.data() as CourierWeeklyTripDoc }))
    .filter(({ data }) => data.active !== false)
    .filter(({ data }) => {
      const d0 = String(data.departureCity ?? data.departure ?? "").trim();
      const a0 = String(data.arrivalCity ?? data.arrival ?? "").trim();
      return normalizeCityKey(d0) === normalizeCityKey(dep) && normalizeCityKey(a0) === normalizeCityKey(arr);
    });

  const slots: TripInstanceDocWithId[] = [];
  for (const date of dates) {
    const dayName = dayjs.tz(`${date}T12:00:00`, BAMAKO_TZ).locale("fr").format("dddd").toLowerCase();
    for (const { id: weeklyTripId, data } of weeklyRows) {
      const hours = weeklyTripHoursForDay(data.horaires, dayName);
      const wdep = String(data.departureCity ?? data.departure ?? dep).trim() || dep;
      const warr = String(data.arrivalCity ?? data.arrival ?? arr).trim() || arr;
      const cap = Math.max(1, Number(data.places ?? data.seats ?? 30) || 30);
      for (const rawTime of hours) {
        const time = normalizeTripInstanceTime(String(rawTime));
        if (!time || isPastDepartureTime(date, time)) continue;
        const id = buildTripInstanceId(weeklyTripId, date, time);
        slots.push({
          id,
          companyId,
          agencyId,
          destinationAgencyId: null,
          agenciesInvolved: [agencyId],
          departure: wdep,
          arrival: warr,
          departureCity: wdep,
          arrivalCity: warr,
          routeDeparture: wdep,
          routeArrival: warr,
          weeklyTripId,
          vehicleId: null,
          date,
          time,
          departureTime: time,
          status: "scheduled",
          passengerCount: 0,
          reservedSeats: 0,
          parcelCount: 0,
          capacity: cap,
          capacitySeats: cap,
          seatCapacity: cap,
          remainingSeats: cap,
          price: Number(data.price ?? 0) || 0,
          routeId: data.routeId ?? null,
        });
      }
    }
  }

  const instances = await listTripInstancesByRouteAndDateRange(
    companyId,
    dep,
    arr,
    dates[0]!,
    dates[dates.length - 1]!,
    { limitCount: 400 }
  );
  const instancesFromAgency = instances;
  const byId = new Map(instancesFromAgency.map((ti) => [ti.id, ti]));
  const byWeeklyDateTime = new Map<string, TripInstanceDocWithId>();
  for (const ti of instancesFromAgency) {
    const wid = String((ti as { weeklyTripId?: string | null }).weeklyTripId ?? "").trim();
    if (!wid) continue;
    byWeeklyDateTime.set(`${wid}|${ti.date}|${normalizeTripInstanceTime(tripInstanceTime(ti))}`, ti);
  }

  const merged = new Map<string, TripInstanceDocWithId>();
  for (const slot of slots) {
    const concrete =
      byId.get(slot.id) ??
      byWeeklyDateTime.get(`${slot.weeklyTripId ?? ""}|${slot.date}|${normalizeTripInstanceTime(tripInstanceTime(slot))}`);
    const row = concrete ?? slot;
    if (String(row.status ?? "").toLowerCase() === "cancelled") continue;
    merged.set(row.id, row);
  }
  for (const ti of instancesFromAgency) {
    if (String(ti.status ?? "").toLowerCase() !== "cancelled") merged.set(ti.id, ti);
  }

  return Array.from(merged.values()).sort(
    (a, b) => a.date.localeCompare(b.date, "en-CA") || departureSlotLabel(a).localeCompare(departureSlotLabel(b), "fr", { numeric: true })
  );
}

function localDigitsFromFull(phoneFull: string, callingCode: string): string {
  const d = phoneFull.replace(/\D/g, "");
  const cc = callingCode.replace(/\D/g, "");
  if (d.startsWith(cc)) return d.slice(cc.length);
  return d;
}

/** Indicatif + numéro national, chiffres uniquement (ex. 22370123456), pour `wa.me/{digits}`. */
function digitsOnlyInternationalForWaMe(phoneRaw: string, rule: PhoneCountryRule): string | null {
  const digits = String(phoneRaw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  const local = sanitizeLocalPhone(phoneRaw, rule);
  if (isValidLocalPhone(local, rule)) return `${rule.callingCode.replace(/\D/g, "")}${local}`;
  return null;
}

type FlowPhase = "form" | "ticket";
type ShipmentUiCreateStatus = "enregistrement_en_cours" | "enregistré" | "erreur";

type OptimisticShipmentItem = {
  localId: string;
  shipment: Shipment;
  createParams: CreateShipmentParams;
  uiStatus: ShipmentUiCreateStatus;
  errorMessage?: string | null;
};

export default function CourierCreateShipmentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, company } = useAuth() as {
    user: { uid: string; companyId?: string; agencyId?: string; displayName?: string; agencyNom?: string };
    company: Company | null;
  };
  const w = useCourierWorkspace();
  const {
    session,
    sessionId,
    shipments,
    companyId,
    agencyId,
    agentId,
    agentName,
    agentCode,
    agencyName,
    companyName,
    companyLogoUrl,
    primaryColor,
  } = w;

  const sessionActive = String(session?.status ?? "").toUpperCase() === "ACTIVE";
  const {
    status: operationQuota,
    quotaReached,
    quotaWarning,
  } = useOperationQuotaStatus(companyId);
  const upgradeHref = companyId ? `/compagnie/${companyId}/parametres/plan` : "/compagnie/parametres/plan";

  const money = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const displayAgentName = user?.displayName ?? agentName;
  const theme = useCompanyTheme(company as Company | null);
  const themePrimary = theme?.colors?.primary ?? primaryColor;
  const themeSecondary = theme?.colors?.secondary ?? "#6366F1";

  const courierShipmentPrefixSource = company?.courierShipmentReferencePrefix;

  const phoneRule = useMemo(
    () => getPhoneRuleFromCountry(company?.pays),
    [company]
  );

  const [flowPhase, setFlowPhase] = useState<FlowPhase>("form");
  const [isLgUp, setIsLgUp] = useState(() => {
    if (typeof window === "undefined") return true;
    return typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true;
  });
  const [destinationAgencyId, setDestinationAgencyId] = useState("");
  const [selectedArrivalCity, setSelectedArrivalCity] = useState("");
  /** Jour choisi (YYYY-MM-DD) — jamais affiché en brut à l'écran. */
  const [courierTripDate, setCourierTripDate] = useState(() => getTodayBamako());
  const [originAgencyCity, setOriginAgencyCity] = useState("");
  const [companyAgencies, setCompanyAgencies] = useState<{ id: string; ville: string; nom: string }[]>([]);
  const [routeArrivalCities, setRouteArrivalCities] = useState<string[]>([]);
  const [senderFullNameInput, setSenderFullNameInput] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [receiverFullNameInput, setReceiverFullNameInput] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [nature, setNature] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [transportFee, setTransportFee] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedShipment, setLastCreatedShipment] = useState<Shipment | null>(null);
  const [paperType, setPaperType] = useState<CourierPrintPaper>(() => readCourierPrintPaper());
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);
  const [tripsInWindow, setTripsInWindow] = useState<TripInstanceDocWithId[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [selectedTripInstanceId, setSelectedTripInstanceId] = useState<string | null>(null);
  const [editingShipmentId, setEditingShipmentId] = useState<string | null>(null);
  /** Incrémenté au retour sur le formulaire pour refocus le 1er champ (impression, nouvel envoi, etc.). */
  const [formFocusSeq, setFormFocusSeq] = useState(0);
  const [rapidChain, setRapidChain] = useState(() => {
    try {
      return localStorage.getItem(COURIER_RAPID_CHAIN_LS) === "1";
    } catch {
      return false;
    }
  });
  const [optimisticShipments, setOptimisticShipments] = useState<OptimisticShipmentItem[]>([]);
  const [activeTicketLocalId, setActiveTicketLocalId] = useState<string | null>(null);

  const loadedEditRef = useRef<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  /** Par envoi : évite de refocaliser « Imprimer » en boucle (mode enchaînement rapide). */
  const rapidChainFocusHandledRef = useRef<string | null>(null);
  const printPreviewButtonRef = useRef<HTMLButtonElement>(null);
  const handlePrintAllRef = useRef<() => void>(() => {});

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
          toast.error("Problème de synchronisation, veuillez réessayer");
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLgUp(mq.matches);
    onChange();
    // Safari support
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyMq = mq as any;
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    if (typeof anyMq.addListener === "function") {
      anyMq.addListener(onChange);
      return () => anyMq.removeListener(onChange);
    }
  }, []);

  useEffect(() => {
    const edit = searchParams.get("edit");
    if (!edit) return;
    setFlowPhase("form");
    setLastCreatedShipment(null);
    setEditingShipmentId(edit);
    loadedEditRef.current = null;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("edit");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  const availableDates = useMemo(() => {
    const t0 = getTodayBamako();
    return Array.from({ length: DAYS_IN_ADVANCE }, (_, i) =>
      dayjs.tz(`${t0}T12:00:00`, BAMAKO_TZ).add(i, "day").format("YYYY-MM-DD")
    );
  }, []);

  const dateFromStrip = availableDates[0] ?? "";
  const dateToStrip = availableDates[availableDates.length - 1] ?? "";

  useEffect(() => {
    if (!companyId || !agencyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [originSnap, allSnap] = await Promise.all([
          getDoc(doc(db, "companies", companyId, "agences", agencyId)),
          getDocs(collection(db, "companies", companyId, "agences")),
        ]);
        if (cancelled) return;
        const originCity = originSnap.exists() ? cityLabelFromAgencyDoc(originSnap.data() as Record<string, unknown>) : "";
        setOriginAgencyCity(originCity);
        const rows = allSnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            ville: cityLabelFromAgencyDoc(data),
            nom: agencyNomFromDoc(data),
          };
        });
        setCompanyAgencies(rows);
      } catch {
        if (!cancelled) {
          setOriginAgencyCity("");
          setCompanyAgencies([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId || !originAgencyCity.trim() || !dateFromStrip || !dateToStrip) {
      setRouteArrivalCities([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const dep = originAgencyCity.trim();
      const arrivalSet = new Set<string>();
      let tripsForArrivals: Array<Record<string, unknown>> = [];
      try {
        const qArrivals = query(
          collection(db, "companies", companyId, "tripInstances"),
          where("departureCity", "==", dep),
          where("date", ">=", dateFromStrip),
          where("date", "<=", dateToStrip),
          orderBy("date", "asc"),
          orderBy("departureTime", "asc"),
          limit(100)
        );
        const snap = await getDocs(qArrivals);
        tripsForArrivals = snap.docs.map((d) => d.data() as Record<string, unknown>);
      } catch {
        /* source complémentaire seulement */
      }
      if (tripsForArrivals.length === 0) {
        try {
          const qByAgency = query(
            collection(db, "companies", companyId, "tripInstances"),
            where("agencyId", "==", agencyId),
            limit(200)
          );
          const snap = await getDocs(qByAgency);
          tripsForArrivals = snap.docs
            .map((d) => d.data() as Record<string, unknown>)
            .filter((ti) => {
              const date = String(ti.date ?? "");
              return date >= dateFromStrip && date <= dateToStrip;
            });
        } catch {
          /* source complémentaire seulement */
        }
      }
      for (const ti of tripsForArrivals) {
        const arr = String(ti.arrivalCity ?? ti.routeArrival ?? ti.arrival ?? "").trim();
        if (arr && normalizeCityKey(arr) !== normalizeCityKey(dep)) arrivalSet.add(arr);
      }
      try {
        const wtSnap = await getDocs(collection(db, "companies", companyId, "agences", agencyId, "weeklyTrips"));
        for (const d of wtSnap.docs) {
          const wt = d.data() as Record<string, unknown>;
          if (wt.active === false) continue;
          const d0 = String(wt.departureCity ?? wt.departure ?? "").trim();
          const a0 = String(wt.arrivalCity ?? wt.arrival ?? "").trim();
          if (!a0 || normalizeCityKey(d0) !== normalizeCityKey(dep)) continue;
          if (normalizeCityKey(a0) !== normalizeCityKey(dep)) arrivalSet.add(a0);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        setRouteArrivalCities(Array.from(arrivalSet).sort((a, b) => a.localeCompare(b, "fr")));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId, originAgencyCity, dateFromStrip, dateToStrip]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const q = query(shipmentsRef(db, companyId), where("originAgencyId", "==", agencyId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as Shipment);
      const sorted = list.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
      setRecentShipments(sorted.slice(0, RECENT_SHIPMENTS_LIMIT));
    });
    return () => unsub();
  }, [companyId, agencyId]);

  const arrivalCityOptions = useMemo(
    () => routeArrivalCities.filter((city) => city.trim()).sort((a, b) => a.localeCompare(b, "fr")),
    [routeArrivalCities]
  );

  const resolvedDestinationAgency = useMemo(() => {
    const selected = selectedArrivalCity.trim();
    if (!selected) return null;
    const originKey = normalizeCityKey(originAgencyCity);
    return companyAgencies.find((a) => {
      if (a.id === agencyId) return false;
      if (originKey && a.ville && normalizeCityKey(a.ville) === originKey) return false;
      return agencyMatchesRouteCity(a, selected);
    }) ?? null;
  }, [agencyId, companyAgencies, originAgencyCity, selectedArrivalCity]);

  useEffect(() => {
    setDestinationAgencyId(resolvedDestinationAgency?.id ?? "");
  }, [resolvedDestinationAgency]);

  useEffect(() => {
    if (!selectedArrivalCity) return;
    if (arrivalCityOptions.some((city) => normalizeCityKey(city) === normalizeCityKey(selectedArrivalCity))) return;
    setSelectedArrivalCity("");
    setDestinationAgencyId("");
    setSelectedTripInstanceId(null);
  }, [arrivalCityOptions, selectedArrivalCity]);

  useEffect(() => {
    if (selectedArrivalCity || !destinationAgencyId) return;
    const row = companyAgencies.find((a) => a.id === destinationAgencyId);
    const city = (row?.ville || row?.nom || "").trim();
    if (city) setSelectedArrivalCity(city);
  }, [companyAgencies, destinationAgencyId, selectedArrivalCity]);

  const destinationConfigMissing = selectedArrivalCity.trim() !== "" && !resolvedDestinationAgency;

  const tripLookupDates = useMemo(() => {
    const dates = new Set(availableDates);
    if (courierTripDate) dates.add(courierTripDate);
    return Array.from(dates).sort((a, b) => a.localeCompare(b, "en-CA"));
  }, [availableDates, courierTripDate]);

  const arrivalCityForTrips = selectedArrivalCity.trim();

  useEffect(() => {
    if (!courierTripDate) {
      setCourierTripDate(getTodayBamako());
    }
  }, [courierTripDate]);

  useEffect(() => {
    if (
      !companyId ||
      !agencyId ||
      !originAgencyCity.trim() ||
      !arrivalCityForTrips ||
      !dateFromStrip ||
      !dateToStrip
    ) {
      setTripsInWindow([]);
      return;
    }
    let cancelled = false;
    setTripsLoading(true);
    void (async () => {
      try {
        const all = await listCourierTripsFromGuichetSource({
          companyId,
          agencyId,
          departureCity: originAgencyCity.trim(),
          arrivalCity: arrivalCityForTrips,
          dates: tripLookupDates,
        });
        if (cancelled) return;
        const filtered = all.filter((ti) => tripAcceptsOneMoreParcel(ti));
        setTripsInWindow(filtered);
      } catch {
        if (!cancelled) setTripsInWindow([]);
      } finally {
        if (!cancelled) setTripsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    agencyId,
    originAgencyCity,
    arrivalCityForTrips,
    tripLookupDates,
  ]);

  const candidateTrips = useMemo(
    () => tripsInWindow.filter((ti) => !isPastDepartureTime(ti.date, String(ti.departureTime))),
    [tripsInWindow]
  );

  const candidateDateKeys = useMemo(() => {
    const set = new Set<string>();
    for (const ti of candidateTrips) {
      if (ti.date) set.add(ti.date);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "en-CA"));
  }, [candidateTrips]);

  const tripsOnCourierDate = useMemo(() => {
    if (!courierTripDate) return [];
    return candidateTrips
      .filter((ti) => ti.date === courierTripDate)
      .slice()
      .sort((a, b) => departureSlotLabel(a).localeCompare(departureSlotLabel(b), "fr", { numeric: true }));
  }, [candidateTrips, courierTripDate]);

  /** Horaire facultatif : conserver seulement un choix encore compatible avec la date. */
  useEffect(() => {
    if (!courierTripDate) return;
    const dayTrips = candidateTrips.filter((ti) => ti.date === courierTripDate);
    setSelectedTripInstanceId((prev) => {
      if (prev && dayTrips.some((t) => t.id === prev)) return prev;
      return null;
    });
  }, [candidateTrips, courierTripDate]);

  /** Édition : aligner le jour affiché sur le trajet déjà lié. */
  useEffect(() => {
    if (!selectedTripInstanceId) return;
    const t = candidateTrips.find((x) => x.id === selectedTripInstanceId);
    if (t?.date && t.date !== courierTripDate) setCourierTripDate(t.date);
  }, [selectedTripInstanceId, candidateTrips, courierTripDate]);

  const loadShipmentIntoForm = useCallback(
    (s: Shipment) => {
      const sn = splitPersonName(s.sender?.name ?? "");
      setSenderFullNameInput(toNameCase(`${sn.prenom} ${sn.nom}`.trim()));
      setSenderPhone(localDigitsFromFull(s.sender?.phone ?? "", phoneRule.callingCode));
      const rn = splitPersonName(s.receiver?.name ?? "");
      setReceiverFullNameInput(toNameCase(`${rn.prenom} ${rn.nom}`.trim()));
      setReceiverPhone(localDigitsFromFull(s.receiver?.phone ?? "", phoneRule.callingCode));
      setNature(sanitizeNatureColisInput(s.nature ?? ""));
      setDeclaredValue(String(s.declaredValue ?? 0));
      setTransportFee(String(s.transportFee ?? 0));
      setDestinationAgencyId(s.destinationAgencyId ?? "");
      const destinationRow = companyAgencies.find((a) => a.id === s.destinationAgencyId);
      setSelectedArrivalCity((destinationRow?.ville || destinationRow?.nom || "").trim());
      const tid = s.tripInstanceId?.trim() || null;
      setSelectedTripInstanceId(tid);
      if (!tid) setCourierTripDate(getTodayBamako());
    },
    [companyAgencies, phoneRule.callingCode]
  );

  useEffect(() => {
    if (!editingShipmentId) {
      loadedEditRef.current = null;
      return;
    }
    const s = shipments.find((x) => x.shipmentId === editingShipmentId);
    if (!s || s.currentStatus !== "CREATED") return;
    if (loadedEditRef.current === editingShipmentId) return;
    loadShipmentIntoForm(s);
    loadedEditRef.current = editingShipmentId;
  }, [editingShipmentId, shipments, loadShipmentIntoForm]);

  useEffect(() => {
    if (!editingShipmentId) return;
    const s = shipments.find((x) => x.shipmentId === editingShipmentId);
    if (!s) return;
    if (s.currentStatus !== "CREATED") {
      setEditingShipmentId(null);
      loadedEditRef.current = null;
      setError("Ce colis n'est plus modifiable ici (statut ≠ CREATED). Utilisez le Rapport.");
    }
  }, [editingShipmentId, shipments]);

  const senderPhoneSuggestions = useMemo(() => {
    const prefix = senderPhone.trim().toLowerCase();
    if (prefix.length < 2) return [];
    const seen = new Set<string>();
    const out: { phone: string; name: string }[] = [];
    for (const s of recentShipments) {
      const ph = (s.sender?.phone ?? "").trim();
      if (!ph || !ph.toLowerCase().startsWith(prefix) || seen.has(ph)) continue;
      seen.add(ph);
      out.push({ phone: ph, name: (s.sender?.name ?? "").trim() || ph });
      if (out.length >= MAX_PHONE_SUGGESTIONS) break;
    }
    return out;
  }, [recentShipments, senderPhone]);

  const receiverPhoneSuggestions = useMemo(() => {
    const prefix = receiverPhone.trim().toLowerCase();
    if (prefix.length < 2) return [];
    const seen = new Set<string>();
    const out: { phone: string; name: string }[] = [];
    for (const s of recentShipments) {
      const ph = (s.receiver?.phone ?? "").trim();
      if (!ph || !ph.toLowerCase().startsWith(prefix) || seen.has(ph)) continue;
      seen.add(ph);
      out.push({ phone: ph, name: (s.receiver?.name ?? "").trim() || ph });
      if (out.length >= MAX_PHONE_SUGGESTIONS) break;
    }
    return out;
  }, [recentShipments, receiverPhone]);

  const total = useMemo(() => {
    const fee = Number(transportFee);
    return Number.isNaN(fee) || fee < 0 ? 0 : fee;
  }, [transportFee]);

  const senderFullName = senderFullNameInput.trim();
  const receiverFullName = receiverFullNameInput.trim();
  const senderNameOk = senderFullName.length >= 2;
  const receiverNameOk = receiverFullName.length >= 2;

  const selectedTripFromCandidates = useMemo(
    () => candidateTrips.find((t) => t.id === selectedTripInstanceId) ?? null,
    [candidateTrips, selectedTripInstanceId]
  );

  // Diagnostic du bouton: uniquement les champs visibles et obligatoires doivent bloquer la création.
  // L'agence destination et le tripInstanceId restent techniques et optionnels côté UX courrier.
  const submitBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!selectedArrivalCity.trim()) blockers.push("destination");
    if (!courierTripDate) blockers.push("date d'expédition");
    if (!senderNameOk) blockers.push("nom expéditeur");
    if (!senderPhone.trim() || !isValidLocalPhone(senderPhone, phoneRule)) blockers.push("téléphone expéditeur");
    if (!receiverNameOk) blockers.push("nom destinataire");
    if (!receiverPhone.trim() || !isValidLocalPhone(receiverPhone, phoneRule)) blockers.push("téléphone destinataire");
    if (!nature.trim()) blockers.push("nature colis");
    if (!declaredValue.trim() || Number.isNaN(Number(declaredValue)) || Number(declaredValue) < 0) blockers.push("valeur déclarée");
    if (!transportFee.trim() || Number.isNaN(Number(transportFee)) || Number(transportFee) <= 0) blockers.push("frais");
    return blockers;
  }, [
    courierTripDate,
    declaredValue,
    nature,
    phoneRule,
    receiverNameOk,
    receiverPhone,
    selectedArrivalCity,
    senderNameOk,
    senderPhone,
    transportFee,
  ]);

  const tripSelectionOk =
    selectedArrivalCity.trim() !== "" &&
    !!courierTripDate;

  const canSubmit =
    tripSelectionOk &&
    submitBlockers.length === 0;

  const destinationAgencyName = useCallback(
    (id: string) => {
      const row = companyAgencies.find((a) => a.id === id);
      if (!row) return id;
      return row.nom && row.nom !== row.ville ? `${row.ville} — ${row.nom}` : row.ville || row.nom || id;
    },
    [companyAgencies]
  );

  const displayRef = lastCreatedShipment?.shipmentNumber ?? lastCreatedShipment?.shipmentId ?? "";

  const clearForm = useCallback(() => {
    setSenderFullNameInput("");
    setSenderPhone("");
    setReceiverFullNameInput("");
    setReceiverPhone("");
    setNature("");
    setDeclaredValue("");
    setTransportFee("");
    setDestinationAgencyId("");
    setSelectedArrivalCity("");
    setCourierTripDate(getTodayBamako());
    setSelectedTripInstanceId(null);
    setEditingShipmentId(null);
    loadedEditRef.current = null;
  }, []);

  const patchOptimisticShipment = useCallback(
    (localId: string, patch: Partial<OptimisticShipmentItem>) => {
      setOptimisticShipments((prev) =>
        prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const runCreateShipmentAsync = useCallback(
    async (item: OptimisticShipmentItem) => {
      const localId = item.localId;
      patchOptimisticShipment(localId, { uiStatus: "enregistrement_en_cours", errorMessage: null });
      try {
        const { shipmentId, shipmentNumber, trackingPublicId, trackingToken } = await createShipment(item.createParams);
        const createdShipment: Shipment = {
          ...item.shipment,
          shipmentId,
          shipmentNumber,
          trackingPublicId,
          trackingToken,
          currentStatus: "CREATED",
        };
        patchOptimisticShipment(localId, { shipment: createdShipment, uiStatus: "enregistré", errorMessage: null });
        if (activeTicketLocalId === localId) {
          setLastCreatedShipment(createdShipment);
        }
        void (async () => {
          const snap = await getDoc(shipmentRef(db, item.createParams.companyId, shipmentId));
          if (snap.exists()) {
            const fromDb = { ...(snap.data() as Shipment), shipmentId };
            patchOptimisticShipment(localId, { shipment: fromDb, uiStatus: "enregistré", errorMessage: null });
            if (activeTicketLocalId === localId) setLastCreatedShipment(fromDb);
          }
        })();
      } catch (err) {
        const msg = operationQuotaErrorMessage(err) ?? (err instanceof Error ? err.message : "Erreur d'enregistrement");
        patchOptimisticShipment(localId, { uiStatus: "erreur", errorMessage: msg });
        if (activeTicketLocalId === localId) {
          setError(msg);
        }
      }
    },
    [activeTicketLocalId, patchOptimisticShipment]
  );

  const goToFormNew = useCallback(() => {
    rapidChainFocusHandledRef.current = null;
    setLastCreatedShipment(null);
    setActiveTicketLocalId(null);
    setFlowPhase("form");
    clearForm();
    setFormFocusSeq((s) => s + 1);
  }, [clearForm]);

  const goToFormEdit = useCallback(() => {
    if (!lastCreatedShipment) return;
    const id = lastCreatedShipment.shipmentId;
    setEditingShipmentId(id);
    loadedEditRef.current = null;
    setLastCreatedShipment(null);
    setActiveTicketLocalId(null);
    setFlowPhase("form");
    setFormFocusSeq((s) => s + 1);
  }, [lastCreatedShipment]);

  /** Reçu + étiquette — après fermeture de l’aperçu : retour formulaire vierge + focus guichet. */
  const handlePrintAll = useCallback(() => {
    writeCourierPrintMode("all");
    const finish = () => {
      goToFormNew();
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const root = document.getElementById("print-root");
        if (!root) return;
        if (printCourierRootInNewWindow(root as HTMLElement, { onAfterPrint: finish })) return;
        if (printCourierRootInIframe(root as HTMLElement, { onAfterPrint: finish })) return;
        let done = false;
        const runFinish = () => {
          if (done) return;
          done = true;
          window.removeEventListener("afterprint", onAfterPrint);
          window.clearTimeout(safety);
          finish();
        };
        const onAfterPrint = () => runFinish();
        const safety = window.setTimeout(() => runFinish(), 4000);
        window.addEventListener("afterprint", onAfterPrint);
        window.print();
      });
    });
  }, [goToFormNew]);

  handlePrintAllRef.current = handlePrintAll;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !sessionActive) {
      setError("Session courrier inactive ou absente. Ouvrez une session courrier pour enregistrer l'envoi.");
      return;
    }
    if (!canSubmit) {
      setError(`Champs à compléter: ${submitBlockers.join(", ")}`);
      return;
    }
    if (editingShipmentId) {
      setError(null);
      setSubmitting(true);
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.onLine &&
          selectedTripInstanceId?.trim() &&
          companyId
        ) {
          const tSnap = await getDoc(
            doc(db, "companies", companyId, "tripInstances", selectedTripInstanceId)
          );
          const tripOk = tSnap.exists()
            ? tripAcceptsOneMoreParcelFromDoc(tSnap.data() as Record<string, unknown>)
            : !!selectedTripFromCandidates && tripAcceptsOneMoreParcel(selectedTripFromCandidates);
          if (!tripOk) {
            setError(COURIER_TRIP_UNAVAILABLE);
            setSubmitting(false);
            return;
          }
        }
        const fee = Number(transportFee);
        const decl = Number(declaredValue);
        const senderNameFinal = toNameCase(senderFullName);
        const receiverNameFinal = toNameCase(receiverFullName);
        const senderPhoneLocal = sanitizeLocalPhone(senderPhone, phoneRule);
        const receiverPhoneLocal = sanitizeLocalPhone(receiverPhone, phoneRule);
        if (!isValidLocalPhone(senderPhoneLocal, phoneRule) || !isValidLocalPhone(receiverPhoneLocal, phoneRule)) {
          throw new Error(`Numéro invalide. Format attendu: +${phoneRule.callingCode} (${phoneRule.localLength} chiffres).`);
        }
        const senderPhoneFull = `+${phoneRule.callingCode}${senderPhoneLocal}`;
        const receiverPhoneFull = `+${phoneRule.callingCode}${receiverPhoneLocal}`;

        await updateCreatedShipment({
          companyId,
          shipmentId: editingShipmentId,
          originAgencyId: agencyId,
          destinationAgencyId: destinationAgencyId || agencyId,
          sender: { name: senderNameFinal, phone: senderPhoneFull },
          receiver: { name: receiverNameFinal, phone: receiverPhoneFull },
          nature: nature.trim(),
          declaredValue: Number.isNaN(decl) ? 0 : decl,
          transportFee: fee,
          tripInstanceId: selectedTripInstanceId || null,
        });

        setEditingShipmentId(null);
        const snap = await getDoc(shipmentRef(db, companyId, editingShipmentId));
        if (snap.exists()) {
          setLastCreatedShipment({ ...(snap.data() as Shipment), shipmentId: editingShipmentId });
        }
        clearForm();
        setFlowPhase("ticket");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur enregistrement");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (quotaReached) {
      setError(OPERATION_QUOTA_BLOCKED_MESSAGE);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.onLine &&
        selectedTripInstanceId?.trim() &&
        companyId
      ) {
        const tSnap = await getDoc(
          doc(db, "companies", companyId, "tripInstances", selectedTripInstanceId)
        );
        const tripOk = tSnap.exists()
          ? tripAcceptsOneMoreParcelFromDoc(tSnap.data() as Record<string, unknown>)
          : !!selectedTripFromCandidates && tripAcceptsOneMoreParcel(selectedTripFromCandidates);
        if (!tripOk) {
          setError(COURIER_TRIP_UNAVAILABLE);
          setSubmitting(false);
          return;
        }
      }
      const fee = Number(transportFee);
      const decl = Number(declaredValue);
      const senderNameFinal = toNameCase(senderFullName);
      const receiverNameFinal = toNameCase(receiverFullName);
      const senderPhoneLocal = sanitizeLocalPhone(senderPhone, phoneRule);
      const receiverPhoneLocal = sanitizeLocalPhone(receiverPhone, phoneRule);
      if (!isValidLocalPhone(senderPhoneLocal, phoneRule) || !isValidLocalPhone(receiverPhoneLocal, phoneRule)) {
        throw new Error(`Numéro invalide. Format attendu: +${phoneRule.callingCode} (${phoneRule.localLength} chiffres).`);
      }
      const senderPhoneFull = `+${phoneRule.callingCode}${senderPhoneLocal}`;
      const receiverPhoneFull = `+${phoneRule.callingCode}${receiverPhoneLocal}`;
      const companyCode = makeShortCode(company?.nom, company?.code);
      const agencyCodeShort = makeShortCode(agencyName, user?.agencyNom);
      const plannedShipmentId = `ship_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const createParams: CreateShipmentParams = {
        companyId,
        originAgencyId: agencyId,
        destinationAgencyId: destinationAgencyId || agencyId,
        sender: { name: senderNameFinal, phone: senderPhoneFull },
        receiver: { name: receiverNameFinal, phone: receiverPhoneFull },
        nature: nature.trim(),
        declaredValue: Number.isNaN(decl) ? 0 : decl,
        insuranceRate: 0,
        insuranceAmount: 0,
        transportFee: fee,
        paymentType: "ORIGIN",
        paymentStatus: "PAID_ORIGIN",
        createdBy: agentId,
        sessionId,
        agentCode,
        companyCode,
        agencyCode: agencyCodeShort,
        shipmentId: plannedShipmentId,
        pickupCode: String(Math.floor(100000 + Math.random() * 900000)),
        tripInstanceId: selectedTripInstanceId || undefined,
        offlineMeta: { mode: "online" },
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const deviceId = await getPersistentDeviceId();
        const transactionId = await offlineStorageService.generateTransactionId(deviceId);
        const offlineShipmentNumber = formatProvisionalCourierShipmentNumber(courierShipmentPrefixSource, transactionId);
        const createdAtMs = Date.now();
        await offlineStorageService.saveTransaction({
          transactionId,
          createdAt: createdAtMs,
          type: "courier_shipment",
          userId: user.uid,
          deviceId,
          payload: {
            params: {
              ...createParams,
              offlineMeta: {
                mode: "offline",
                transactionId,
                deviceId,
                createdAt: createdAtMs,
              },
            },
          },
        });
        const optimisticOffline: Shipment = {
          shipmentId: transactionId,
          shipmentNumber: offlineShipmentNumber,
          trackingPublicId: "",
          trackingToken: "",
          pickupCode: createParams.pickupCode,
          originAgencyId: agencyId,
          destinationAgencyId: destinationAgencyId || agencyId,
          sender: { name: senderNameFinal, phone: senderPhoneFull },
          receiver: { name: receiverNameFinal, phone: receiverPhoneFull },
          nature: nature.trim(),
          declaredValue: Number.isNaN(decl) ? 0 : decl,
          insuranceRate: 0,
          insuranceAmount: 0,
          transportFee: fee,
          paymentType: "ORIGIN",
          paymentStatus: "PAID_ORIGIN",
          currentStatus: "CREATED",
          currentAgencyId: agencyId,
          tripInstanceId: selectedTripInstanceId ?? null,
          createdAt: new Date(),
          createdBy: agentId,
          sessionId,
          agentCode,
        };
        clearForm();
        setLastCreatedShipment(optimisticOffline);
        setFlowPhase("ticket");
        setError("Envoi enregistré hors ligne. Il sera pris en compte automatiquement lorsque la connexion sera revenue.");
        return;
      }

      const localId = plannedShipmentId;
      const localShipmentNumber = formatProvisionalCourierShipmentNumber(courierShipmentPrefixSource, Date.now());
      const optimistic: Shipment = {
        shipmentId: plannedShipmentId,
        shipmentNumber: localShipmentNumber,
        trackingPublicId: "",
        trackingToken: "",
        pickupCode: createParams.pickupCode,
        originAgencyId: agencyId,
        destinationAgencyId: destinationAgencyId || agencyId,
        sender: { name: senderNameFinal, phone: senderPhoneFull },
        receiver: { name: receiverNameFinal, phone: receiverPhoneFull },
        nature: nature.trim(),
        declaredValue: Number.isNaN(decl) ? 0 : decl,
        insuranceRate: 0,
        insuranceAmount: 0,
        transportFee: fee,
        paymentType: "ORIGIN",
        paymentStatus: "PAID_ORIGIN",
        currentStatus: "CREATED",
        currentAgencyId: agencyId,
        tripInstanceId: selectedTripInstanceId ?? null,
        createdAt: new Date(),
        createdBy: agentId,
        sessionId,
        agentCode,
      };
      const optimisticItem: OptimisticShipmentItem = {
        localId,
        shipment: optimistic,
        createParams,
        uiStatus: "enregistrement_en_cours",
        errorMessage: null,
      };
      setOptimisticShipments((prev) => [optimisticItem, ...prev].slice(0, RECENT_SHIPMENTS_LIMIT));
      clearForm();
      setLastCreatedShipment(optimistic);
      setActiveTicketLocalId(localId);
      setFlowPhase("ticket");
      void runCreateShipmentAsync(optimisticItem);
    } catch (err) {
      setError(operationQuotaErrorMessage(err) ?? (err instanceof Error ? err.message : "Erreur création envoi"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelFromTicket = async () => {
    if (!lastCreatedShipment) return;
    const shipmentId = lastCreatedShipment.shipmentId;
    if (!window.confirm("Annuler cet envoi ? Le colis passera au statut annulé.")) return;
    setError(null);
    try {
      await recordShipmentEvent({
        companyId,
        shipmentId,
        eventType: "CANCELLED",
        agencyId,
        performedBy: agentId,
      });
      const snap = await getDoc(shipmentRef(db, companyId, shipmentId));
      const trip = (snap.data() as Shipment | undefined)?.tripInstanceId?.trim();
      if (trip) await decrementParcelCount(companyId, trip, 1).catch(() => {});
      goToFormNew();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annulation impossible");
    }
  };

  const showTicketView = flowPhase === "ticket" && lastCreatedShipment != null;
  const activeTicketOptimistic =
    activeTicketLocalId != null ? optimisticShipments.find((x) => x.localId === activeTicketLocalId) ?? null : null;
  const activeTicketUiStatus: ShipmentUiCreateStatus =
    activeTicketOptimistic?.uiStatus ?? (showTicketView ? "enregistré" : "enregistrement_en_cours");
  const activeTicketErrorMessage = activeTicketOptimistic?.errorMessage ?? "";
  const activeTicketPaymentPermissionError =
    activeTicketUiStatus === "erreur" &&
    /permission|insufficient|confirmPayment|paiement/i.test(activeTicketErrorMessage);
  const ticketShipmentId = lastCreatedShipment?.shipmentId ?? "";
  const ticketTrackingPublicId = lastCreatedShipment?.trackingPublicId?.trim() ?? "";

  useEffect(() => {
    if (!showTicketView) return;
    console.log("FINAL_SCREEN_STATE", {
      shipmentCreated: Boolean(lastCreatedShipment?.shipmentId),
      paymentConfirmed: activeTicketUiStatus === "enregistré",
      financialTransactionCreated: activeTicketUiStatus === "enregistré",
      error,
      activeTicketLocalId,
      activeTicketUiStatus,
      activeTicketErrorMessage,
      activeTicketPaymentPermissionError,
      shipmentId: lastCreatedShipment?.shipmentId ?? null,
      trackingPublicId: lastCreatedShipment?.trackingPublicId ?? null,
    });
  }, [
    showTicketView,
    lastCreatedShipment?.shipmentId,
    lastCreatedShipment?.trackingPublicId,
    activeTicketLocalId,
    activeTicketUiStatus,
    activeTicketErrorMessage,
    activeTicketPaymentPermissionError,
    error,
  ]);

  useEffect(() => {
    if (!showTicketView || !ticketShipmentId || !companyId || ticketTrackingPublicId) return;
    let cancelled = false;
    void (async () => {
      try {
        await ensureShipmentTracking(companyId, ticketShipmentId);
        if (cancelled) return;
        const snap = await getDoc(shipmentRef(db, companyId, ticketShipmentId));
        if (snap.exists()) {
          setLastCreatedShipment({ ...(snap.data() as Shipment), shipmentId: ticketShipmentId });
        }
      } catch (e) {
        console.warn("[CourierCreateShipmentPage] ensureShipmentTracking", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTicketView, ticketShipmentId, ticketTrackingPublicId, companyId]);

  useEffect(() => {
    if (flowPhase !== "form" || !sessionActive) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        firstFieldRef.current?.focus({ preventScroll: true });
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [flowPhase, sessionActive, formFocusSeq]);

  /** Aperçu toujours visible : pas d’impression auto. Le mode rapide place seulement le focus sur Imprimer. */
  useEffect(() => {
    if (!showTicketView || !rapidChain || !lastCreatedShipment?.shipmentId) return;
    const sid = lastCreatedShipment.shipmentId;
    if (rapidChainFocusHandledRef.current === sid) return;
    rapidChainFocusHandledRef.current = sid;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        printPreviewButtonRef.current?.focus({ preventScroll: false });
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [showTicketView, rapidChain, lastCreatedShipment?.shipmentId]);

  const labelDestinationName = lastCreatedShipment
    ? destinationAgencyName(lastCreatedShipment.destinationAgencyId ?? "")
    : "";
  const trackWebUrl =
    lastCreatedShipment?.trackingPublicId && typeof window !== "undefined"
      ? buildPublicTrackWebUrl(window.location.origin, lastCreatedShipment.trackingPublicId)
      : null;

  const receiverWhatsAppDigits = useMemo(() => {
    const raw = lastCreatedShipment?.receiver?.phone;
    if (!raw?.trim()) return null;
    return digitsOnlyInternationalForWaMe(raw, phoneRule);
  }, [lastCreatedShipment?.receiver?.phone, phoneRule]);

  const whatsAppNotifyHref =
    trackWebUrl && receiverWhatsAppDigits
      ? `https://wa.me/${receiverWhatsAppDigits}?text=${encodeURIComponent(
          `Votre colis a été enregistré. N° envoi : ${displayRef}. Suivez ici : ${trackWebUrl}`
        )}`
      : null;
  const retryOptimisticShipment = useCallback(
    (localId: string) => {
      const item = optimisticShipments.find((x) => x.localId === localId);
      if (!item) return;
      setError(null);
      setFlowPhase("ticket");
      setActiveTicketLocalId(localId);
      setLastCreatedShipment(item.shipment);
      void runCreateShipmentAsync(item);
    },
    [optimisticShipments, runCreateShipmentAsync]
  );

  return (
    <div
      lang="fr"
      className={cn(
        "mx-auto w-full max-w-[1600px] min-h-0 overflow-x-hidden p-2",
        showTicketView &&
          "flex min-h-0 flex-1 flex-col overflow-hidden lg:h-[calc(100dvh-7.5rem)] lg:max-h-[calc(100dvh-7.5rem)]",
        !showTicketView &&
          sessionActive &&
          "flex min-h-0 flex-1 flex-col text-xs max-lg:max-h-[calc(100dvh-3.5rem)] max-lg:overflow-y-auto lg:h-[calc(100dvh-7.5rem)] lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-hidden",
        !showTicketView && !sessionActive && "text-xs"
      )}
    >
      {error && (
        <div className="mb-1.5 flex shrink-0 items-start gap-2 rounded border border-red-200/90 bg-red-50/90 px-2 py-1.5 text-xs text-red-800 dark:border-red-900/80 dark:bg-red-950/50 dark:text-red-200">
          <span className="min-w-0 flex-1 lg:truncate">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 underline">
            Fermer
          </button>
        </div>
      )}

      {(quotaWarning || quotaReached) && operationQuota && !showTicketView && (
        <div className="mb-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900 shadow-sm">
          <p className="font-bold whitespace-pre-line">
            {quotaReached ? OPERATION_QUOTA_BLOCKED_MESSAGE : OPERATION_QUOTA_WARNING_MESSAGE}
          </p>
          <p className="mt-1 text-orange-800">
            {operationQuota.currentMonthOperations.toLocaleString("fr-FR")} /{" "}
            {operationQuota.includedOperations.toLocaleString("fr-FR")} opérations utilisées
          </p>
          {quotaReached && (
            <p className="mt-1 text-[11px] font-medium text-orange-700">
              {OPERATION_QUOTA_BLOCKED_HELP}
            </p>
          )}
          <a
            href={upgradeHref}
            className="mt-2 inline-flex rounded-lg bg-orange-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-700"
          >
            Passer en Premium
          </a>
        </div>
      )}

      {showTicketView ? (
        isLgUp ? (
          <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden px-2 py-3 sm:gap-4 sm:px-3">
            <div className="shrink-0 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {activeTicketUiStatus === "enregistrement_en_cours"
                  ? "Enregistrement en cours"
                  : activeTicketUiStatus === "erreur"
                    ? activeTicketPaymentPermissionError
                      ? "Paiement à confirmer"
                      : "Erreur d'enregistrement"
                    : "Envoi enregistré"}
              </p>
              <p className="mt-0.5 font-mono text-base font-bold text-gray-900 dark:text-gray-100">{displayRef}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                {activeTicketUiStatus === "enregistrement_en_cours"
                  ? "Connexion serveur en cours. Le colis apparaît immédiatement."
                  : activeTicketUiStatus === "erreur"
                    ? activeTicketPaymentPermissionError
                      ? "Le reçu est généré, mais la validation du paiement a échoué côté Firestore."
                      : "L'enregistrement a échoué. Relancez la création."
                    : "Vérifiez le reçu et l'étiquette, puis lancez l'impression."}
              </p>
              {lastCreatedShipment?.pickupCode && (
                <div className="mx-auto mt-2 w-full max-w-md rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100">
                  <p className="font-semibold">Code de retrait : {lastCreatedShipment.pickupCode}</p>
                  <p className="mt-1">Partagez ce code avec la personne qui récupère.</p>
                </div>
              )}
            </div>
            {activeTicketUiStatus !== "enregistré" && (
              <div
                className={`mx-auto w-full max-w-md rounded-lg border px-3 py-2 text-xs ${
                  activeTicketUiStatus === "erreur"
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-100"
                    : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/80 dark:bg-amber-950/40 dark:text-amber-100"
                }`}
              >
                {activeTicketUiStatus === "erreur"
                  ? activeTicketPaymentPermissionError
                    ? `Paiement non confirmé : ${activeTicketOptimistic?.errorMessage || "permission Firestore insuffisante"}`
                    : activeTicketOptimistic?.errorMessage || "Erreur d'enregistrement"
                  : "enregistrement_en_cours"}
              </div>
            )}

            <div className="flex min-h-0 w-full min-w-0 max-w-5xl flex-1 justify-center self-center overflow-hidden px-0 sm:min-h-[12rem]">
              <CourierPrintCombined
                shipment={lastCreatedShipment}
                companyName={companyName}
                companyLogoUrl={companyLogoUrl}
                agencyName={agencyName}
                agentName={displayAgentName}
                agentCode={agentCode}
                destinationAgencyName={labelDestinationName}
                originAgencyName={agencyName}
                trackUrl={trackWebUrl}
                paperType={paperType}
                compact={false}
              />
            </div>

            <div className="mx-auto flex w-full max-w-md shrink-0 flex-col gap-2 pb-2">
              <button
                ref={printPreviewButtonRef}
                type="button"
                onClick={() => handlePrintAll()}
                disabled={activeTicketUiStatus !== "enregistré"}
                className="inline-flex h-10 w-full items-center justify-center rounded-md px-3 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--courier-primary, #ea580c)" }}
              >
                Imprimer
              </button>

              {whatsAppNotifyHref ? (
                <a
                  href={whatsAppNotifyHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-green-600/80 bg-green-50 px-3 text-sm font-medium text-green-900 dark:border-green-500 dark:bg-green-950/40 dark:text-green-100"
                >
                  WhatsApp au destinataire
                </a>
              ) : null}

              <button
                type="button"
                onClick={goToFormEdit}
                disabled={activeTicketUiStatus !== "enregistré"}
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
              >
                Modifier
              </button>
              <button
                type="button"
                onClick={() => void handleCancelFromTicket()}
                disabled={activeTicketUiStatus !== "enregistré"}
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
              >
                Annuler l&apos;envoi
              </button>
              {activeTicketUiStatus === "erreur" && activeTicketOptimistic && (
                <button
                  type="button"
                  onClick={() => retryOptimisticShipment(activeTicketOptimistic.localId)}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
                >
                  Réessayer
                </button>
              )}
              <button
                type="button"
                onClick={goToFormNew}
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 text-sm font-medium text-gray-800 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-100"
              >
                Nouvel envoi
              </button>
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <div className="flex w-full max-w-md flex-col max-h-[94dvh] overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="shrink-0 p-3 text-center">
                <p className="text-xs text-gray-500">
                  {activeTicketUiStatus === "enregistrement_en_cours"
                    ? "Enregistrement en cours"
                    : activeTicketUiStatus === "erreur"
                      ? activeTicketPaymentPermissionError
                        ? "Paiement à confirmer"
                        : "Erreur d'enregistrement"
                      : "Envoi enregistré"}
                </p>
                <p className="mt-0.5 font-mono text-base font-bold text-gray-900">{displayRef}</p>
                {lastCreatedShipment?.pickupCode && (
                  <p className="mt-1 text-xs text-blue-800">
                    Code retrait: <span className="font-semibold">{lastCreatedShipment.pickupCode}</span>
                  </p>
                )}
                {activeTicketUiStatus === "erreur" ? (
                  <p className="mx-auto mt-2 max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {activeTicketPaymentPermissionError
                      ? `Paiement non confirmé : ${activeTicketOptimistic?.errorMessage || "permission Firestore insuffisante"}`
                      : activeTicketOptimistic?.errorMessage || "Erreur d'enregistrement"}
                  </p>
                ) : null}
              </div>

              <div className="flex min-h-0 flex-1 overflow-hidden px-2">
                <CourierPrintCombined
                  shipment={lastCreatedShipment}
                  companyName={companyName}
                  companyLogoUrl={companyLogoUrl}
                  agencyName={agencyName}
                  agentName={displayAgentName}
                  agentCode={agentCode}
                  destinationAgencyName={labelDestinationName}
                  originAgencyName={agencyName}
                  trackUrl={trackWebUrl}
                  paperType={paperType}
                  compact
                />
              </div>

              <div className="shrink-0 mx-auto w-full max-w-md flex-col gap-2 p-3">
                <button
                  ref={printPreviewButtonRef}
                  type="button"
                  onClick={() => handlePrintAll()}
                  disabled={activeTicketUiStatus !== "enregistré"}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md px-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: "var(--courier-primary, #ea580c)" }}
                >
                  Imprimer
                </button>

                {whatsAppNotifyHref ? (
                  <a
                    href={whatsAppNotifyHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 w-full items-center justify-center rounded-md border border-green-600/80 bg-green-50 px-3 text-sm font-medium text-green-900"
                  >
                    WhatsApp au destinataire
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={goToFormEdit}
                  disabled={activeTicketUiStatus !== "enregistré"}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelFromTicket()}
                  disabled={activeTicketUiStatus !== "enregistré"}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
                >
                  Annuler l&apos;envoi
                </button>
                {activeTicketUiStatus === "erreur" && activeTicketOptimistic && (
                  <button
                    type="button"
                    onClick={() => retryOptimisticShipment(activeTicketOptimistic.localId)}
                    className="inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900"
                  >
                    Réessayer
                  </button>
                )}
                <button
                  type="button"
                  onClick={goToFormNew}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 text-sm font-medium text-gray-800 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-100"
                >
                  Nouvel envoi
                </button>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="mb-0.5 flex shrink-0 items-center justify-between gap-2 pr-0.5">
            <span className="min-w-0 text-xs font-semibold text-gray-800 dark:text-gray-100">
              {sessionActive ? "Créer un envoi" : "Envoi"}
            </span>
            {sessionActive ? (
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10px] text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-gray-400"
                  checked={rapidChain}
                  onChange={() => {
                    setRapidChain((v) => {
                      const n = !v;
                      try {
                        localStorage.setItem(COURIER_RAPID_CHAIN_LS, n ? "1" : "0");
                      } catch {
                        /* ignore */
                      }
                      return n;
                    });
                  }}
                />
                Focus sur Imprimer après envoi
              </label>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
            {!session && (
              <p className="shrink-0 rounded border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100">
                Aucune session active. Ouvrez une session depuis la barre courrier et attendez son activation par le comptable.
              </p>
            )}

            {session?.status === "PENDING" && (
              <p className="shrink-0 rounded border border-amber-200/80 bg-amber-50/90 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                Session en attente d&apos;activation par le comptable.
              </p>
            )}

            {optimisticShipments.length > 0 && (
              <section className="shrink-0 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
                <p className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-200">Créations récentes</p>
                <div className="max-h-24 space-y-1 overflow-auto">
                  {optimisticShipments.slice(0, 6).map((it) => (
                    <div key={it.localId} className="flex items-center justify-between gap-2 rounded border border-gray-100 px-2 py-1 text-[11px] dark:border-gray-800">
                      <span className="truncate font-mono">{it.shipment.shipmentNumber || it.localId.slice(-8)}</span>
                      <span className="truncate text-gray-500 dark:text-gray-400">
                        {it.shipment.sender?.name || "-"} - {it.shipment.receiver?.name || "-"}
                      </span>
                      <div className="shrink-0">
                        {it.uiStatus === "erreur" ? (
                          <button
                            type="button"
                            onClick={() => retryOptimisticShipment(it.localId)}
                            className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
                          >
                            Réessayer
                          </button>
                        ) : (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              it.uiStatus === "enregistré"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {it.uiStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {sessionActive && (
              <form
                onSubmit={handleSubmit}
                className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-4"
              >
                {editingShipmentId && (
                  <p className="shrink-0 rounded-lg border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-xs text-sky-900 dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-sky-100">
                    Modification : prévenir la compta si écart de caisse.
                  </p>
                )}

                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:items-stretch">
                  <div className="space-y-4 lg:col-span-2">
                    <section
                      className={cn(formSection, "space-y-4")}
                      style={{
                        backgroundColor: `${themePrimary}12`,
                        borderColor: `${themePrimary}3d`,
                      }}
                    >
                      <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: themePrimary }}>
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${themePrimary}26` }}
                        >
                          <User className="h-3.5 w-3.5" />
                        </span>
                        Expéditeur
                      </h3>
                      <div className={personRowGrid}>
                        <div className="min-w-0">
                          <label className={lblGuichet}>
                            Nom complet <span className="text-red-500">*</span>
                          </label>
                          <input
                            ref={firstFieldRef}
                            value={senderFullNameInput}
                            onChange={(e) => setSenderFullNameInput(e.target.value)}
                            onBlur={(e) => setSenderFullNameInput(toNameCase(e.target.value))}
                            className={inpGuichet}
                            autoComplete="name"
                            placeholder="Nom complet"
                          />
                        </div>
                        <div className="relative min-w-0">
                          <label className={lblGuichet}>
                            Téléphone <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">
                              +{phoneRule.callingCode}
                            </span>
                            <input
                              required
                              type="tel"
                              inputMode="numeric"
                              maxLength={phoneRule.localLength}
                              value={senderPhone}
                              onChange={(e) => setSenderPhone(sanitizeLocalPhone(e.target.value, phoneRule))}
                              className={cn(inpGuichet, "pl-10")}
                            />
                          </div>
                          {senderPhoneSuggestions.length > 0 && (
                            <ul className="absolute z-30 mt-1 max-h-32 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-md dark:border-gray-600 dark:bg-gray-900">
                              {senderPhoneSuggestions.map(({ phone, name }) => (
                                <li key={phone}>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setSenderPhone(localDigitsFromFull(phone, phoneRule.callingCode));
                                      applyFullNameFromSuggestion(setSenderFullNameInput, name, senderFullNameInput);
                                    }}
                                  >
                                    {name || phone} - {phone}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </section>

                    <section
                      className={cn(formSection, "space-y-4")}
                      style={{
                        backgroundColor: `${themeSecondary}12`,
                        borderColor: `${themeSecondary}3d`,
                      }}
                    >
                      <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: themeSecondary }}>
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                          style={{ backgroundColor: `${themeSecondary}26` }}
                        >
                          <UserRoundCheck className="h-3.5 w-3.5" />
                        </span>
                        Destinataire
                      </h3>
                      <div className={personRowGrid}>
                        <div className="min-w-0">
                          <label className={lblGuichet}>
                            Nom complet <span className="text-red-500">*</span>
                          </label>
                          <input
                            value={receiverFullNameInput}
                            onChange={(e) => setReceiverFullNameInput(e.target.value)}
                            onBlur={(e) => setReceiverFullNameInput(toNameCase(e.target.value))}
                            className={inpGuichet}
                            autoComplete="name"
                            placeholder="Nom complet"
                          />
                        </div>
                        <div className="relative min-w-0">
                          <label className={lblGuichet}>
                            Téléphone <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">
                              +{phoneRule.callingCode}
                            </span>
                            <input
                              required
                              type="tel"
                              inputMode="numeric"
                              maxLength={phoneRule.localLength}
                              value={receiverPhone}
                              onChange={(e) => setReceiverPhone(sanitizeLocalPhone(e.target.value, phoneRule))}
                              className={cn(inpGuichet, "pl-10")}
                            />
                          </div>
                          {receiverPhoneSuggestions.length > 0 && (
                            <ul className="absolute z-30 mt-1 max-h-32 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-md dark:border-gray-600 dark:bg-gray-900">
                              {receiverPhoneSuggestions.map(({ phone, name }) => (
                                <li key={phone}>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setReceiverPhone(localDigitsFromFull(phone, phoneRule.callingCode));
                                      applyFullNameFromSuggestion(setReceiverFullNameInput, name, receiverFullNameInput);
                                    }}
                                  >
                                    {name || phone} - {phone}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </section>

                    <section
                      className={cn(formSection, "space-y-3")}
                      style={{
                        backgroundColor: `${themePrimary}0d`,
                        borderColor: `${themePrimary}33`,
                      }}
                    >
                      <h3 className="text-sm font-semibold" style={{ color: themePrimary }}>
                        Trajet
                      </h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.45fr)]">
                          <div className="min-w-0">
                            <label className={lblGuichet}>Départ</label>
                            <div className="flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
                              {originAgencyCity || "Agence courante"}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <label className={lblGuichet}>
                              Date d'expédition <span className="text-red-500">*</span>
                            </label>
                            <input
                              required
                              type="date"
                              value={courierTripDate}
                              onChange={(e) => {
                                setCourierTripDate(e.target.value);
                                setSelectedTripInstanceId(null);
                              }}
                              className={inpGuichet}
                            />
                          </div>
                        </div>

                        <div>
                          <label className={lblGuichet}>
                            Destination <span className="text-red-500">*</span>
                          </label>
                          {arrivalCityOptions.length === 0 ? (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                              Aucune destination configurée pour {originAgencyCity || "cette agence"}.
                            </p>
                          ) : null}

                        <div className={chipScrollRow}>
                          {arrivalCityOptions.map((city) => {
                            const sel = normalizeCityKey(selectedArrivalCity) === normalizeCityKey(city);
                            return (
                              <button
                                key={city}
                                type="button"
                                className={cn(
                                  chipBase,
                                  sel
                                    ? "border-transparent text-white"
                                    : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800"
                                )}
                                style={
                                  sel
                                    ? {
                                        backgroundColor: themePrimary,
                                        borderColor: themePrimary,
                                      }
                                    : undefined
                                }
                                onClick={() => {
                                  setSelectedArrivalCity(city);
                                  setSelectedTripInstanceId(null);
                                }}
                              >
                                {city}
                              </button>
                            );
                          })}
                        </div>
                        </div>

                        {selectedArrivalCity.trim() && tripsLoading ? (
                          <div className="h-9 max-w-[200px] animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
                        ) : null}

                        {selectedArrivalCity.trim() && courierTripDate && tripsOnCourierDate.length > 0 ? (
                          <div className={chipScrollRow}>
                            <button
                              type="button"
                              className={cn(
                                chipBase,
                                selectedTripInstanceId == null
                                  ? "border-transparent text-white"
                                  : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800"
                              )}
                              style={
                                selectedTripInstanceId == null
                                  ? {
                                      backgroundColor: themePrimary,
                                      borderColor: themePrimary,
                                    }
                                  : undefined
                              }
                              onClick={() => setSelectedTripInstanceId(null)}
                            >
                              Sans horaire précis
                            </button>
                            {tripsOnCourierDate.map((ti) => {
                              const sel = selectedTripInstanceId === ti.id;
                              const time = departureSlotLabel(ti);
                              return (
                                <button
                                  key={ti.id}
                                  type="button"
                                  className={cn(
                                    chipBase,
                                    sel
                                      ? "border-transparent text-white"
                                      : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800"
                                  )}
                                  style={
                                    sel
                                      ? {
                                          backgroundColor: themePrimary,
                                          borderColor: themePrimary,
                                        }
                                      : undefined
                                  }
                                  onClick={() => setSelectedTripInstanceId(ti.id)}
                                >
                                  {time}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </section>
                  </div>

                  <aside className="flex min-h-0 flex-col justify-between gap-4 lg:col-span-1 lg:min-h-[min(42rem,calc(100dvh-10rem))]">
                    <section
                      className={cn(formSection, "space-y-3")}
                      style={{
                        backgroundColor: `${themeSecondary}0d`,
                        borderColor: `${themeSecondary}33`,
                      }}
                    >
                      <h3 className="text-sm font-semibold" style={{ color: themeSecondary }}>
                        Détails du colis
                      </h3>
                      <div className="space-y-3">
                        <div className="min-w-0 w-full">
                          <label className={lblGuichet}>
                            Nature <span className="text-red-500">*</span>
                          </label>
                          <input
                            required
                            value={nature}
                            onChange={(e) => setNature(sanitizeNatureColisInput(e.target.value))}
                            className={cn(inpGuichet, "min-h-10 w-full")}
                            placeholder="Documents, colis..."
                          />
                        </div>
                        <div className="min-w-0 w-full">
                          <label className={lblGuichet}>
                            Valeur déclarée ({currencySymbol}) <span className="text-red-500">*</span>
                          </label>
                          <input
                            required
                            type="number"
                            min="0"
                            step="1"
                            value={declaredValue}
                            onChange={(e) => setDeclaredValue(e.target.value)}
                            className={cn(inpGuichet, "min-h-10 w-full")}
                            placeholder="0"
                          />
                        </div>
                        <div className="min-w-0 w-full">
                          <label className={lblGuichet}>
                            Frais ({currencySymbol}) <span className="text-red-500">*</span>
                          </label>
                          <input
                            required
                            type="number"
                            min="1"
                            step="1"
                            value={transportFee}
                            onChange={(e) => setTransportFee(e.target.value)}
                            className={cn(inpGuichet, "min-h-10 w-full")}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </section>

                    <div className="flex min-h-0 flex-1 flex-col justify-end gap-4">
                      <div
                        className={cn(
                          formSection,
                          "flex min-h-0 flex-col overflow-hidden shadow-sm dark:border-gray-700 dark:bg-gray-900"
                        )}
                        style={{
                          backgroundColor: `${themePrimary}12`,
                          borderColor: `${themePrimary}40`,
                        }}
                      >
                        <h3 className="text-sm font-semibold" style={{ color: themePrimary }}>
                          Résumé de l&apos;envoi
                        </h3>
                        <div className="mt-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-gray-500 dark:text-gray-400">Nature</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">{nature.trim() || "-"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-gray-500 dark:text-gray-400">Valeur</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {declaredValue.trim() ? money(Number(declaredValue) || 0) : "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-gray-500 dark:text-gray-400">Frais</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">{money(total)}</span>
                          </div>
                        </div>
                        <div
                          className="mt-3 rounded-lg border p-3 dark:border-gray-700 dark:bg-gray-950/80"
                          style={{
                            backgroundColor: `${themePrimary}18`,
                            borderColor: `${themePrimary}35`,
                          }}
                        >
                          <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                          <p
                            className="text-lg font-bold tabular-nums teliya-monetary sm:text-xl"
                            style={{ color: themePrimary }}
                          >
                            {money(total)}
                          </p>
                        </div>
                        <div
                          className="sticky bottom-0 z-20 mt-3 border-t border-gray-200/90 pt-3 dark:border-gray-600"
                          style={{ backgroundColor: `${themePrimary}12` }}
                        >
                          <button
                            type="submit"
                            disabled={!canSubmit || submitting}
                            className="h-11 w-full rounded-lg border border-transparent text-sm font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: themePrimary }}
                          >
                            {submitting ? "Traitement..." : editingShipmentId ? "Enregistrer" : "Créer l'envoi"}
                          </button>
                          {editingShipmentId ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingShipmentId(null);
                                clearForm();
                              }}
                              className="mt-2 w-full py-1 text-center text-xs text-gray-600 underline dark:text-gray-400"
                            >
                              Abandonner la modification
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </aside>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
