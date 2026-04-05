/**
 * Page d'embarquement et descente escale : lister les passagers à embarquer ou à faire descendre pour un bus.
 * Onglets : Embarquement passagers | Descente passagers.
 * Accessible par escale_agent et escale_manager.
 */
import React, { useCallback, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, EmptyState, table, tableRowClassName } from "@/ui";
import {
  tripInstanceDeparture,
  tripInstanceArrival,
  tripInstanceTime,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import {
  markBoarded,
  markNoShow,
  type PassengerForBoarding,
} from "@/modules/compagnie/boarding/boardingService";
import {
  markDropped,
  type PassengerToDrop,
} from "@/modules/compagnie/dropoff/dropoffService";
import { UserCheck, UserX, Loader2, UserMinus } from "lucide-react";
import { toLocalDateStr } from "@/shared/date/dayFilterUtils";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import {
  buildStopIdToOrderMap,
  reservationBoardingWindowAtStop,
  reservationDropoffAtStop,
} from "@/modules/compagnie/routes/stopResolution";

type TabId = "boarding" | "dropoff";

export default function BoardingEscalePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("boarding");
  const [agencyRouteId, setAgencyRouteId] = useState<string | null>(null);
  const [agencyStopOrder, setAgencyStopOrder] = useState<number | null>(null);
  const [tripInstances, setTripInstances] = useState<
    Array<{ id: string; time: string; departure: string; arrival: string; agencyId: string }>
  >([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [passengers, setPassengers] = useState<PassengerForBoarding[]>([]);
  const [passengersToDrop, setPassengersToDrop] = useState<PassengerToDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPassengers, setLoadingPassengers] = useState(false);
  const [loadingDropoff, setLoadingDropoff] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingDropoffId, setUpdatingDropoffId] = useState<string | null>(null);
  const today = toLocalDateStr(new Date());

  const loadAgencyAndTrips = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) {
      setLoading(false);
      return;
    }
    try {
      const agencyRef = doc(db, "companies", user.companyId, "agences", user.agencyId);
      const agencySnap = await getDoc(agencyRef);
      if (!agencySnap.exists()) {
        setLoading(false);
        return;
      }
      const ad = agencySnap.data() as { type?: string; routeId?: string; stopOrder?: number };
      const routeId = ad.routeId ?? null;
      const stopOrder = ad.stopOrder ?? null;
      if (ad.type !== "escale" || !routeId || stopOrder == null) {
        setLoading(false);
        return;
      }
      setAgencyRouteId(routeId);
      setAgencyStopOrder(stopOrder);
      const tripRef = collection(db, "companies", user.companyId, "tripInstances");
      const snap = await getDocs(
        query(
          tripRef,
          where("routeId", "==", routeId),
          where("date", ">=", today),
          where("date", "<=", today),
          orderBy("date", "asc"),
          orderBy("time", "asc")
        )
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      setTripInstances(
        list
          .filter((ti) => String((ti as any).routeId ?? "") === routeId)
          .filter((ti) => (ti as { status?: string }).status !== "cancelled")
          .map((ti) => ({
            id: ti.id,
            time: tripInstanceTime(ti),
            departure: tripInstanceDeparture(ti),
            arrival: tripInstanceArrival(ti),
            agencyId: String((ti as any).agencyId ?? ""),
          }))
      );
      if (list.length > 0 && !selectedTripId) setSelectedTripId(list[0].id);
    } catch (e) {
      console.error("[BoardingEscale] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId, today]);

  useEffect(() => {
    loadAgencyAndTrips();
  }, [loadAgencyAndTrips]);

  const loadPassengers = useCallback(async () => {
    if (!user?.companyId || agencyStopOrder == null || !selectedTripId || !agencyRouteId) {
      setPassengers([]);
      return;
    }
    setLoadingPassengers(true);
    try {
      const trip = tripInstances.find((t) => t.id === selectedTripId);
      if (!trip?.agencyId) {
        setPassengers([]);
        return;
      }
      const stops = await getRouteStops(user.companyId, agencyRouteId);
      const idToOrder = buildStopIdToOrderMap(stops);
      const reservationsRef = collection(db, "companies", user.companyId, "agences", trip.agencyId, "reservations");
      const snap = await getDocs(
        query(reservationsRef, where("tripInstanceId", "==", selectedTripId), orderBy("createdAt", "asc"))
      );
      const list: PassengerForBoarding[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any), agencyId: trip.agencyId } as PassengerForBoarding))
        .filter((r) => (r.boardingStatus ?? "pending") !== "boarded")
        .filter((r) => (r.journeyStatus ?? "booked") !== "cancelled")
        .filter((r) => reservationBoardingWindowAtStop(r as unknown as Record<string, unknown>, agencyStopOrder, idToOrder));
      setPassengers(list);
    } catch (e) {
      console.error("[BoardingEscale] getPassengers error:", e);
      setPassengers([]);
    } finally {
      setLoadingPassengers(false);
    }
  }, [user?.companyId, selectedTripId, agencyStopOrder, agencyRouteId, tripInstances]);

  useEffect(() => {
    loadPassengers();
  }, [loadPassengers]);

  const loadPassengersToDrop = useCallback(async () => {
    if (!user?.companyId || agencyStopOrder == null || !selectedTripId || !agencyRouteId) {
      setPassengersToDrop([]);
      return;
    }
    setLoadingDropoff(true);
    try {
      const trip = tripInstances.find((t) => t.id === selectedTripId);
      if (!trip?.agencyId) {
        setPassengersToDrop([]);
        return;
      }
      const stops = await getRouteStops(user.companyId, agencyRouteId);
      const idToOrder = buildStopIdToOrderMap(stops);
      const reservationsRef = collection(db, "companies", user.companyId, "agences", trip.agencyId, "reservations");
      const snap = await getDocs(
        query(reservationsRef, where("tripInstanceId", "==", selectedTripId), orderBy("createdAt", "asc"))
      );
      const list: PassengerToDrop[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any), agencyId: trip.agencyId } as PassengerToDrop))
        .filter((r) => (r.boardingStatus ?? "pending") === "boarded")
        .filter((r) => (r.dropoffStatus ?? "pending") !== "dropped")
        .filter((r) => reservationDropoffAtStop(r as unknown as Record<string, unknown>, agencyStopOrder, idToOrder));
      setPassengersToDrop(list);
    } catch (e) {
      console.error("[BoardingEscale] getPassengersToDrop error:", e);
      setPassengersToDrop([]);
    } finally {
      setLoadingDropoff(false);
    }
  }, [user?.companyId, selectedTripId, agencyStopOrder, agencyRouteId, tripInstances]);

  useEffect(() => {
    if (activeTab === "dropoff") loadPassengersToDrop();
  }, [activeTab, loadPassengersToDrop]);

  const handleMarkBoarded = useCallback(
    async (r: PassengerForBoarding) => {
      if (!user?.companyId) return;
      setUpdatingId(r.id);
      try {
        await markBoarded(user.companyId, r.agencyId, r.id);
        setPassengers((prev) => prev.filter((p) => p.id !== r.id));
      } catch (e) {
        console.error("[BoardingEscale] markBoarded error:", e);
        alert(e instanceof Error ? e.message : "Erreur");
      } finally {
        setUpdatingId(null);
      }
    },
    [user?.companyId]
  );

  const handleMarkNoShow = useCallback(
    async (r: PassengerForBoarding) => {
      if (!user?.companyId) return;
      setUpdatingId(r.id);
      try {
        await markNoShow(user.companyId, r.agencyId, r.id);
        setPassengers((prev) => prev.filter((p) => p.id !== r.id));
      } catch (e) {
        console.error("[BoardingEscale] markNoShow error:", e);
        alert(e instanceof Error ? e.message : "Erreur");
      } finally {
        setUpdatingId(null);
      }
    },
    [user?.companyId]
  );

  const handleMarkDropped = useCallback(
    async (r: PassengerToDrop) => {
      if (!user?.companyId) return;
      setUpdatingDropoffId(r.id);
      try {
        await markDropped(user.companyId, r.agencyId, r.id);
        setPassengersToDrop((prev) => prev.filter((p) => p.id !== r.id));
      } catch (e) {
        console.error("[BoardingEscale] markDropped error:", e);
        alert(e instanceof Error ? e.message : "Erreur");
      } finally {
        setUpdatingDropoffId(null);
      }
    },
    [user?.companyId]
  );

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

  if (!agencyRouteId || agencyStopOrder == null) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Embarquement" icon={UserCheck} />
        <SectionCard title="Configuration">
          <p className="text-amber-600 dark:text-amber-400">
            Cette agence n&apos;est pas configurée en escale (routeId et stopOrder requis).
          </p>
        </SectionCard>
      </StandardLayoutWrapper>
    );
  }

  const selectedTrip = tripInstances.find((t) => t.id === selectedTripId);

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Embarquement & descente"
        subtitle="Marquer les passagers embarqués, absents ou descendus"
        icon={UserCheck}
      />

      <SectionCard title="Choisir le bus" className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="trip-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Bus :
          </label>
          <select
            id="trip-select"
            value={selectedTripId ?? ""}
            onChange={(e) => setSelectedTripId(e.target.value || null)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm min-w-[200px]"
          >
            {tripInstances.map((t) => (
              <option key={t.id} value={t.id}>
                {t.departure} → {t.arrival} — {t.time}
              </option>
            ))}
          </select>
        </div>
      </SectionCard>

      {/* Onglets */}
      <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setActiveTab("boarding")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === "boarding"
              ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-b-0 border-gray-200 dark:border-gray-600"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Embarquement passagers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dropoff")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === "dropoff"
              ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-b-0 border-gray-200 dark:border-gray-600"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          }`}
        >
          Descente passagers
        </button>
      </div>

      {activeTab === "boarding" && (
        <SectionCard
          title={selectedTrip ? `Passagers à embarquer — ${selectedTrip.departure} → ${selectedTrip.arrival} ${selectedTrip.time}` : "Passagers à embarquer"}
          noPad
        >
          {loadingPassengers ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
              Chargement…
            </div>
          ) : passengers.length === 0 ? (
            <EmptyState message="Aucun passager en attente pour ce bus à cette escale." />
          ) : (
            <div className={table.wrapper}>
              <table className={table.base}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Nom passager</th>
                    <th className={table.th}>Destination</th>
                    <th className={table.th}>Places</th>
                    <th className={table.th}>Actions</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {passengers.map((r) => (
                    <tr key={r.id} className={tableRowClassName()}>
                      <td className={table.td}>{r.nomClient || "—"}</td>
                      <td className={table.td}>{r.arrivee || "—"}</td>
                      <td className={table.td}>{r.seatsGo}</td>
                      <td className={table.td}>
                        <div className="flex items-center gap-2">
                          <ActionButton
                            size="sm"
                            onClick={() => handleMarkBoarded(r)}
                            disabled={updatingId === r.id}
                            title="Passager embarqué"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Embarqué
                          </ActionButton>
                          <ActionButton
                            size="sm"
                            variant="secondary"
                            onClick={() => handleMarkNoShow(r)}
                            disabled={updatingId === r.id}
                            title="Passager absent"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            Absent
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {activeTab === "dropoff" && (
        <SectionCard
          title={selectedTrip ? `Passagers à faire descendre — ${selectedTrip.departure} → ${selectedTrip.arrival} ${selectedTrip.time}` : "Descente passagers"}
          noPad
        >
          {loadingDropoff ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
              Chargement…
            </div>
          ) : passengersToDrop.length === 0 ? (
            <EmptyState message="Aucun passager à faire descendre à cette escale pour ce bus." />
          ) : (
            <div className={table.wrapper}>
              <table className={table.base}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Nom</th>
                    <th className={table.th}>Origine</th>
                    <th className={table.th}>Destination</th>
                    <th className={table.th}>Correspondance</th>
                    <th className={table.th}>Actions</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {passengersToDrop.map((r) => {
                    return (
                      <tr key={r.id} className={tableRowClassName()}>
                        <td className={table.td}>{r.nomClient || "—"}</td>
                        <td className={table.td}>{r.depart || "—"}</td>
                        <td className={table.td}>{r.arrivee || "—"}</td>
                        <td className={table.td}>{r.connectionId ? "Correspondance" : "—"}</td>
                        <td className={table.td}>
                          <ActionButton
                            size="sm"
                            onClick={() => handleMarkDropped(r)}
                            disabled={updatingDropoffId === r.id}
                            title="Passager descendu"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Descendu
                          </ActionButton>
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
    </StandardLayoutWrapper>
  );
}
