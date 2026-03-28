/**
 * Tableau de bord escale — 4 cartes : Bus du jour, Ventes aujourd'hui, Caisse, Activité escale.
 * Utilise listTripInstancesByRouteIdAndDate pour les bus du jour.
 */
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { activateSession } from "@/modules/agence/services/sessionService";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, EmptyState, table, tableRowClassName } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { getRoute } from "@/modules/compagnie/routes/routesService";
import { CashSummaryCard } from "@/modules/compagnie/cash/CashSummaryCard";
import {
  getCashTransactionsByLocation,
  getCashTotalByLocation,
  getLastClosureByLocation,
} from "@/modules/compagnie/cash/cashService";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import { listTripInstancesByRouteIdAndDate } from "@/modules/compagnie/tripInstances/tripInstanceService";
import {
  tripInstanceSeatCapacity,
  tripInstanceDeparture,
  tripInstanceArrival,
  tripInstanceTime,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import {
  getTripProgress,
  getLastProgressFromList,
  markArrival,
  markDeparture,
  ensureAutoDepartForStopIfNeeded,
  ORIGIN_STOP_ORDER,
} from "@/modules/compagnie/tripInstances/tripProgressService";
import type { ProgressStopDocWithId } from "@/modules/compagnie/tripInstances/tripProgressService";
import type { RouteDocWithId } from "@/modules/compagnie/routes/routesTypes";
import type { RouteStopDocWithId } from "@/modules/compagnie/routes/routesTypes";
import type { TripInstanceDocWithId } from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import { Bus, Ticket, Loader2, MapPin, Wallet, Activity, ChevronRight, Clock, LogIn, LogOut } from "lucide-react";
import { parseIndexUrlFromError } from "@/utils/firestoreErrorHandler";
import { FirestoreIndexLink } from "@/shared/components/FirestoreIndexLink";
import { DayFilterBar } from "@/shared/date/DayFilterBar";
import { getSelectedDateStr, toLocalDateStr, type DayPreset } from "@/shared/date/dayFilterUtils";
import { resolveAgencyTimezone } from "@/shared/date/dateUtilsTz";

function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutesToAdd;
  const h2 = Math.floor(total / 60) % 24;
  const m2 = total % 60;
  return `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
}

export default function EscaleDashboardPage() {
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const theme = useCompanyTheme(company ?? null);
  const [agencyRouteId, setAgencyRouteId] = useState<string | null>(null);
  const [agencyStopOrder, setAgencyStopOrder] = useState<number | null>(null);
  const [route, setRoute] = useState<RouteDocWithId | null>(null);
  const [stop, setStop] = useState<RouteStopDocWithId | null>(null);
  const [instances, setInstances] = useState<TripInstanceDocWithId[]>([]);
  const [progressStatusByInstanceId, setProgressStatusByInstanceId] = useState<
    Record<string, "en_route" | "arrived" | "departed">
  >({});
  const [lastProgressByInstanceId, setLastProgressByInstanceId] = useState<
    Record<string, { city: string; departed: boolean; delayMinutes?: number | null } | null>
  >({});
  const [progressAtStopByInstanceId, setProgressAtStopByInstanceId] = useState<
    Record<string, ProgressStopDocWithId | null>
  >({});
  const [originDepartedByInstanceId, setOriginDepartedByInstanceId] = useState<Record<string, boolean>>({});
  const [progressingTripId, setProgressingTripId] = useState<string | null>(null);
  const [salesCount, setSalesCount] = useState(0);
  const [salesTotal, setSalesTotal] = useState(0);
  const [lastClosureDate, setLastClosureDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexErrorUrl, setIndexErrorUrl] = useState<string | null>(null);
  const [dayPreset, setDayPreset] = useState<DayPreset>("today");
  const [customDate, setCustomDate] = useState<string>(() => toLocalDateStr(new Date()));
  const [pendingShifts, setPendingShifts] = useState<Array<{ id: string; userName?: string; userId: string; createdAt?: unknown }>>([]);
  const [activatingShiftId, setActivatingShiftId] = useState<string | null>(null);

  const selectedDateStr = getSelectedDateStr(dayPreset, customDate);
  const rolesArr: string[] = Array.isArray((user as any)?.role) ? (user as any).role : (user as any)?.role ? [(user as any).role] : [];
  const isEscaleManager = rolesArr.includes("escale_manager");

  const progressStatusLabel: Record<string, string> = {
    en_route: "En route",
    arrived: "Arrivé à l'escale",
    departed: "Parti de l'escale",
  };
  const getBusStatus = (progressStatus: "en_route" | "arrived" | "departed", originDeparted: boolean): "scheduled" | "in_transit" | "arrived" | "departed" => {
    if (!originDeparted) return "scheduled";
    if (progressStatus === "departed") return "departed";
    if (progressStatus === "arrived") return "arrived";
    return "in_transit";
  };

  const load = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) {
      setLoading(false);
      setError("Session invalide.");
      return;
    }
    setLoading(true);
    setError(null);
    setIndexErrorUrl(null);
    try {
      const agencyRef = doc(db, "companies", user.companyId, "agences", user.agencyId);
      const agencySnap = await getDoc(agencyRef);
      if (!agencySnap.exists()) {
        setError("Agence introuvable.");
        setLoading(false);
        return;
      }
      const ad = agencySnap.data() as { type?: string; routeId?: string; stopOrder?: number; timezone?: string };
      const escaleTz = resolveAgencyTimezone(ad);
      const typ = (ad.type ?? "principale").toLowerCase();
      const routeId = ad.routeId ?? null;
      const stopOrder = ad.stopOrder ?? null;
      setAgencyRouteId(routeId);
      setAgencyStopOrder(stopOrder);

      if (typ !== "escale" || !routeId) {
        setError("Cette agence n'est pas configurée en escale (type=escale, routeId et stopOrder requis).");
        setLoading(false);
        return;
      }

      const routeDoc = await getRoute(user.companyId, routeId);
      setRoute(routeDoc ?? null);
      if (!routeDoc) {
        setError("Route introuvable.");
        setLoading(false);
        return;
      }

      const stops = await getRouteStops(user.companyId, routeId);
      const myStop = stopOrder != null ? stops.find((s) => s.order === stopOrder) : null;
      setStop(myStop ?? null);
      if (!myStop) {
        setError("Escale (stopOrder) introuvable sur cette route.");
        setLoading(false);
        return;
      }

      const [list, total, lastClosure] = await Promise.all([
        listTripInstancesByRouteIdAndDate(user.companyId, routeId, selectedDateStr),
        getCashTotalByLocation(user.companyId, user.agencyId, selectedDateStr, escaleTz),
        getLastClosureByLocation(user.companyId, user.agencyId),
      ]);
      const txList = await getCashTransactionsByLocation(user.companyId, user.agencyId, selectedDateStr, escaleTz);
      const progressById: Record<string, "en_route" | "arrived" | "departed"> = {};
      const lastProgressById: Record<string, { city: string; departed: boolean; delayMinutes?: number | null } | null> = {};
      const progressAtStopById: Record<string, ProgressStopDocWithId | null> = {};
      const originDepartedById: Record<string, boolean> = {};
      const escaleStopOrder = stopOrder ?? null;
      await Promise.all(
        list.map(async (ti) => {
          if (escaleStopOrder != null) {
            let progressList = await getTripProgress(user.companyId, ti.id);
            await ensureAutoDepartForStopIfNeeded(user.companyId, ti.id, escaleStopOrder);
            progressList = await getTripProgress(user.companyId, ti.id);
            const atThisStop = progressList.find((p) => p.stopOrder === escaleStopOrder) ?? null;
            progressAtStopById[ti.id] = atThisStop;
            progressById[ti.id] = !atThisStop
              ? "en_route"
              : atThisStop.departureTime != null
                ? "departed"
                : atThisStop.arrivalTime != null
                  ? "arrived"
                  : "en_route";
            const last = getLastProgressFromList(progressList);
            lastProgressById[ti.id] = last ? { city: last.city, departed: last.departed, delayMinutes: last.delayMinutes } : null;
            const originProgress = progressList.find((p) => p.stopOrder === ORIGIN_STOP_ORDER);
            originDepartedById[ti.id] = !!originProgress?.departureTime;
          }
        })
      );
      setInstances(list);
      setOriginDepartedByInstanceId(originDepartedById);
      setProgressStatusByInstanceId(progressById);
      setLastProgressByInstanceId(lastProgressById);
      setProgressAtStopByInstanceId(progressAtStopById);
      setSalesTotal(total);
      setSalesCount(txList.length);
      setLastClosureDate(lastClosure?.date ?? null);
    } catch (e: unknown) {
      const url = parseIndexUrlFromError(e);
      if (url) setIndexErrorUrl(url);
      const msg = e instanceof Error ? e.message : "Erreur de chargement.";
      const isPermission = typeof msg === "string" && (msg.includes("Missing or insufficient") || (e as { code?: string })?.code === "permission-denied");
      setError(isPermission ? "Permissions Firestore insuffisantes. Vérifiez que les règles incluent les rôles escale et que l’utilisateur a un document users/{uid} avec role et agencyId." : msg);
      setInstances([]);
      setProgressStatusByInstanceId({});
      setLastProgressByInstanceId({});
      setProgressAtStopByInstanceId({});
      setOriginDepartedByInstanceId({});
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId, selectedDateStr]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isEscaleManager || !user?.companyId || !user?.agencyId) {
      setPendingShifts([]);
      return;
    }
    const ref = collection(db, "companies", user.companyId, "agences", user.agencyId, "shifts");
    const q = query(ref, where("status", "==", "pending"));
    const unsub = onSnapshot(q, (snap) => {
      setPendingShifts(
        snap.docs.map((d) => ({
          id: d.id,
          userId: (d.data() as any).userId ?? "",
          userName: (d.data() as any).userName ?? null,
          createdAt: (d.data() as any).createdAt,
        }))
      );
    });
    return () => unsub();
  }, [isEscaleManager, user?.companyId, user?.agencyId]);

  const handleActivateShift = useCallback(
    async (shiftId: string) => {
      if (!user?.companyId || !user?.agencyId || !(user as any)?.uid) return;
      setActivatingShiftId(shiftId);
      try {
        await activateSession({
          companyId: user.companyId,
          agencyId: user.agencyId,
          shiftId,
          activatedBy: {
            id: (user as any).uid,
            name: (user as any).displayName ?? (user as any).nom ?? (user as any).email ?? "Chef d'escale",
          },
        });
      } catch (e) {
        console.error("[EscaleDashboard] activateSession error:", e);
        alert(e instanceof Error ? e.message : "Erreur lors de l'activation du poste.");
      } finally {
        setActivatingShiftId(null);
      }
    },
    [user?.companyId, user?.agencyId, user]
  );

  const rows = instances.map((ti) => {
    const capacity = tripInstanceSeatCapacity(ti);
    const remaining = Math.max(0, Number((ti as { remainingSeats?: number }).remainingSeats ?? 0));
    const departureTime = tripInstanceTime(ti);
    const offsetMin = stop?.estimatedArrivalOffsetMinutes ?? 0;
    const timeAtStop = addMinutesToTime(departureTime || "00:00", offsetMin);
    const origin = tripInstanceDeparture(ti);
    const dest = tripInstanceArrival(ti);
    const progressStatus = progressStatusByInstanceId[ti.id] ?? "en_route";
    const lastProgress = lastProgressByInstanceId[ti.id] ?? null;
    const progressAtStop = progressAtStopByInstanceId[ti.id] ?? null;
    const originDeparted = originDepartedByInstanceId[ti.id] ?? false;
    const busStatus = getBusStatus(progressStatus, originDeparted);
    const realTime = progressAtStop?.arrivalTime
      ? (() => {
          const d = progressAtStop.arrivalTime!.toDate();
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        })()
      : null;
    const delayMinutes = progressAtStop?.delayMinutes ?? lastProgress?.delayMinutes ?? null;
    return {
      id: ti.id,
      origin,
      dest,
      timeAtStop,
      realTime,
      delayMinutes,
      remaining,
      capacity,
      status: (ti as { status?: string }).status,
      progressStatus,
      busStatus,
      lastProgress,
    };
  });

  const handleVendreBillet = (tripInstanceId: string) => {
    navigate("/agence/guichet", {
      state: {
        fromEscale: true,
        tripInstanceId,
        routeId: agencyRouteId,
        stopOrder: agencyStopOrder,
        originEscaleCity: stop?.city ?? undefined,
      },
    });
  };

  const handleMarkArrival = useCallback(
    async (tripInstanceId: string) => {
      if (!user?.companyId || agencyStopOrder == null || !(user as any)?.uid) return;
      setProgressingTripId(tripInstanceId);
      try {
        await markArrival(user.companyId, tripInstanceId, agencyStopOrder, (user as any).uid);
        setProgressStatusByInstanceId((prev) => ({ ...prev, [tripInstanceId]: "arrived" }));
        const progressList = await getTripProgress(user.companyId, tripInstanceId);
        const atThisStop = progressList.find((p) => p.stopOrder === agencyStopOrder) ?? null;
        const last = getLastProgressFromList(progressList);
        setProgressAtStopByInstanceId((prev) => ({ ...prev, [tripInstanceId]: atThisStop }));
        setLastProgressByInstanceId((prev) => ({ ...prev, [tripInstanceId]: last ? { city: last.city, departed: last.departed, delayMinutes: last.delayMinutes } : null }));
      } catch (e) {
        console.error("[EscaleDashboard] markArrival error:", e);
        alert(e instanceof Error ? e.message : "Erreur lors de l'enregistrement de l'arrivée.");
      } finally {
        setProgressingTripId(null);
      }
    },
    [user?.companyId, user, agencyStopOrder]
  );

  const handleMarkDeparture = useCallback(
    async (tripInstanceId: string) => {
      if (!user?.companyId || agencyStopOrder == null || !(user as any)?.uid) return;
      setProgressingTripId(tripInstanceId);
      try {
        await markDeparture(user.companyId, tripInstanceId, agencyStopOrder, (user as any).uid);
        setProgressStatusByInstanceId((prev) => ({ ...prev, [tripInstanceId]: "departed" }));
      } catch (e) {
        console.error("[EscaleDashboard] markDeparture error:", e);
        alert(e instanceof Error ? e.message : "Erreur lors de l'enregistrement du départ.");
      } finally {
        setProgressingTripId(null);
      }
    },
    [user?.companyId, user, agencyStopOrder]
  );

  const primaryColor = theme?.colors?.primary ?? "#2563eb";
  const secondaryColor = theme?.colors?.secondary ?? "#6366f1";

  if (loading) {
    return (
      <StandardLayoutWrapper>
        <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
          Chargement…
        </div>
      </StandardLayoutWrapper>
    );
  }

  if (error) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Tableau de bord escale" icon={MapPin} />
        <SectionCard title={indexErrorUrl ? "Index Firestore requis" : "Configuration"}>
          <p className="text-amber-600 dark:text-amber-400">{error}</p>
          {!indexErrorUrl && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Une agence de type &quot;escale&quot; doit avoir les champs routeId et stopOrder (ordre de l&apos;escale sur la route).
            </p>
          )}
          {indexErrorUrl && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                Cliquez sur <strong>Copier</strong> pour copier le lien, puis ouvrez-le dans un navigateur pour créer l&apos;index.
              </p>
              <FirestoreIndexLink indexUrl={indexErrorUrl} title="Lien de création d'index" />
            </div>
          )}
        </SectionCard>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <PageHeader
          title="Tableau de bord escale"
          subtitle={stop?.city ?? "Escale"}
          icon={Bus}
        />
        <DayFilterBar
          preset={dayPreset}
          customDate={customDate}
          onPresetChange={setDayPreset}
          onCustomDateChange={setCustomDate}
        />
      </div>

      {/* 4 cartes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Bus du jour */}
        <Link
          to="/agence/escale/bus"
          className="block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md transition"
          style={{ ["--teliya-primary" as string]: primaryColor }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Bus du jour</p>
              <p className="text-2xl font-bold mt-1" style={{ color: primaryColor }}>{instances.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">trajets aujourd&apos;hui</p>
            </div>
            <Bus className="w-8 h-8 opacity-60" style={{ color: primaryColor }} />
          </div>
          <div className="mt-3 flex items-center gap-1 text-sm font-medium" style={{ color: primaryColor }}>
            Voir la liste
            <ChevronRight className="w-4 h-4" />
          </div>
        </Link>

        {/* Ventes aujourd'hui */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ventes aujourd&apos;hui</p>
              <p className="text-2xl font-bold mt-1" style={{ color: secondaryColor }}>{money(salesTotal)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{salesCount} transaction(s)</p>
            </div>
            <Ticket className="w-8 h-8 opacity-60" style={{ color: secondaryColor }} />
          </div>
        </div>

        {/* Caisse */}
        <Link
          to="/agence/escale/caisse"
          className="block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md transition"
          style={{ ["--teliya-primary" as string]: primaryColor }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Caisse</p>
              <p className="text-sm mt-1 text-gray-700 dark:text-gray-300">Voir détail et clôture</p>
            </div>
            <Wallet className="w-8 h-8 opacity-60" style={{ color: primaryColor }} />
          </div>
          <div className="mt-3 flex items-center gap-1 text-sm font-medium" style={{ color: primaryColor }}>
            Ouvrir
            <ChevronRight className="w-4 h-4" />
          </div>
        </Link>

        {/* Activité escale */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Activité escale</p>
              <p className="text-sm font-semibold mt-1 text-gray-800 dark:text-gray-200">
                {lastClosureDate ? `Dernière clôture : ${lastClosureDate}` : "Aucune clôture"}
              </p>
            </div>
            <Activity className="w-8 h-8 opacity-60 text-gray-400" />
          </div>
        </div>
      </div>

      {isEscaleManager && (
        <SectionCard title="Postes en attente d'activation" icon={Clock} className="mb-6" noPad>
          {pendingShifts.length === 0 ? (
            <EmptyState message="Aucun poste en attente d'activation." />
          ) : (
            <div className={table.wrapper}>
              <table className={table.base}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Guichetier</th>
                    <th className={table.th}>Action</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {pendingShifts.map((s) => (
                    <tr key={s.id} className={tableRowClassName()}>
                      <td className={table.td}>{s.userName ?? s.userId}</td>
                      <td className={table.td}>
                        <ActionButton
                          size="sm"
                          onClick={() => handleActivateShift(s.id)}
                          disabled={activatingShiftId === s.id}
                        >
                          {activatingShiftId === s.id ? "Activation…" : "Activer"}
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* Carte détaillée Bus du jour avec bouton Vendre billet */}
      <SectionCard title={`Bus du jour (${selectedDateStr})`} noPad>
        {rows.length === 0 ? (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400">
            Aucun bus prévu aujourd&apos;hui pour cette escale.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.slice(0, 5).map((r) => {
              const delayColor =
                r.delayMinutes != null && r.delayMinutes > 0
                  ? r.delayMinutes <= 10
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
                  : "text-gray-600 dark:text-gray-400";
              return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{r.origin} → {r.dest}</span>
                  <span className="ml-2 text-sm text-gray-500">Passage {r.timeAtStop}</span>
                  <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded ${
                    r.busStatus === "departed" ? "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300" :
                    r.busStatus === "arrived" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200" :
                    r.busStatus === "scheduled" ? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300" :
                    "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200"
                  }`}>
                    {r.busStatus === "scheduled" ? "Programmé" : progressStatusLabel[r.progressStatus] ?? "En route"}
                  </span>
                  {/* Heure prévue / réelle / retard à cette escale (ex. Segou — Prévu : 11:00, Réel : 11:18, Retard : 18 min) */}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
                    {stop?.city && <span className="font-medium text-gray-700 dark:text-gray-300">{stop.city}</span>}
                    <span>Prévu : {r.timeAtStop}</span>
                    <span>Réel : {r.realTime ?? "—"}</span>
                    {r.delayMinutes != null && (
                      <span className={delayColor}>
                        Retard : {r.delayMinutes > 0 ? `${r.delayMinutes} min` : r.delayMinutes < 0 ? `${-r.delayMinutes} min (avance)` : "À l'heure"}
                      </span>
                    )}
                  </div>
                  {/* Visibilité réseau : autres escales voient retard + dernière escale */}
                  {r.progressStatus === "en_route" && r.lastProgress && (
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {r.lastProgress.departed ? `Bus parti de ${r.lastProgress.city}` : `Bus arrivé à ${r.lastProgress.city}`}
                      {r.lastProgress.delayMinutes != null && r.lastProgress.delayMinutes > 0 && (
                        <span className={`ml-1 font-medium ${r.lastProgress.delayMinutes <= 10 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                          · Retard : {r.lastProgress.delayMinutes} min
                        </span>
                      )}
                      <span className="ml-1">· Dernière escale : {r.lastProgress.city}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-medium ${r.remaining <= 0 ? "text-red-600" : r.remaining <= 10 ? "text-amber-600" : "text-gray-700 dark:text-gray-300"}`}>
                    {r.remaining} / {r.capacity} places
                  </span>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => handleMarkArrival(r.id)}
                    disabled={r.progressStatus !== "en_route" || progressingTripId === r.id}
                    title="Enregistrer l'arrivée du bus à l'escale"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Arrivé
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => handleMarkDeparture(r.id)}
                    disabled={r.progressStatus !== "arrived" || progressingTripId === r.id}
                    title="Enregistrer le départ du bus de l'escale"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Départ
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleVendreBillet(r.id)}
                    disabled={r.remaining <= 0 || r.status === "cancelled"}
                    title={r.remaining <= 0 ? "Complet" : "Vendre un billet"}
                  >
                    <Ticket className="w-4 h-4" />
                    Vendre billet
                  </ActionButton>
                </div>
              </li>
            );
            })}
          </ul>
        )}
        {rows.length > 5 && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-center">
            <Link to="/agence/escale/bus" className="text-sm font-medium" style={{ color: primaryColor }}>
              Voir tous les bus ({rows.length})
            </Link>
          </div>
        )}
      </SectionCard>

      {/* Caisse (résumé) */}
      {user?.companyId && user?.agencyId && (
        <div className="mt-6">
          <CashSummaryCard
            companyId={user.companyId}
            locationId={user.agencyId}
            locationType="escale"
            canClose={true}
            createdBy={user?.uid ?? ""}
            formatCurrency={money}
            date={selectedDateStr}
            ianaTimezone={resolveAgencyTimezone({ timezone: (user as { agencyTimezone?: string })?.agencyTimezone })}
          />
        </div>
      )}
    </StandardLayoutWrapper>
  );
}
