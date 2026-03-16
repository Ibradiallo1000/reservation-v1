/**
 * Manifeste passagers du bus : à bord, à descendre ici, en dépassement (fraude).
 * Accessible par escale_agent, escale_manager, chefAgence.
 */
import React, { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, EmptyState, table, tableRowClassName } from "@/ui";
import { listTripInstancesByRouteIdAndDate } from "@/modules/compagnie/tripInstances/tripInstanceService";
import {
  getPassengersOnBoard,
  getPassengersToDrop,
  detectOvertravelPassengers,
  type ManifestPassenger,
} from "@/modules/compagnie/manifest/passengerManifestService";
import { markDropped } from "@/modules/compagnie/dropoff/dropoffService";
import type { PassengerToDrop } from "@/modules/compagnie/dropoff/dropoffService";
import { getNextSegmentInfo } from "@/modules/compagnie/connections/connectionsService";
import { getTripProgress } from "@/modules/compagnie/tripInstances/tripProgressService";
import { ClipboardList, Loader2, UserMinus, AlertTriangle, Bus, Link2 } from "lucide-react";

export default function BusPassengerManifestPage() {
  const { user } = useAuth();
  const [agencyRouteId, setAgencyRouteId] = useState<string | null>(null);
  const [agencyStopOrder, setAgencyStopOrder] = useState<number | null>(null);
  const [tripInstances, setTripInstances] = useState<Array<{ id: string; departureTime: string; routeDeparture?: string; routeArrival?: string }>>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [onBoard, setOnBoard] = useState<ManifestPassenger[]>([]);
  const [toDrop, setToDrop] = useState<PassengerToDrop[]>([]);
  const [overtravel, setOvertravel] = useState<ManifestPassenger[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [updatingDropoffId, setUpdatingDropoffId] = useState<string | null>(null);
  const [nextSegmentByDropId, setNextSegmentByDropId] = useState<Record<string, { routeLabel: string; departureTime: string } | null>>({});
  const [currentBusDelayMinutes, setCurrentBusDelayMinutes] = useState<number | null>(null);

  const today = new Date().toISOString().slice(0, 10);

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
      const list = await listTripInstancesByRouteIdAndDate(user.companyId, routeId, today);
      setTripInstances(
        list
          .filter((ti) => (ti as { status?: string }).status !== "cancelled")
          .map((ti) => ({
            id: ti.id,
            departureTime: (ti as { departureTime?: string }).departureTime ?? "",
            routeDeparture: (ti as { routeDeparture?: string }).routeDeparture ?? (ti as { departureCity?: string }).departureCity ?? "",
            routeArrival: (ti as { routeArrival?: string }).routeArrival ?? (ti as { arrivalCity?: string }).arrivalCity ?? "",
          }))
      );
      if (list.length > 0 && !selectedTripId) setSelectedTripId(list[0].id);
    } catch (e) {
      console.error("[Manifest] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId, today]);

  useEffect(() => {
    loadAgencyAndTrips();
  }, [loadAgencyAndTrips]);

  const loadManifest = useCallback(async () => {
    if (!user?.companyId || !selectedTripId) {
      setOnBoard([]);
      setToDrop([]);
      setOvertravel([]);
      setNextSegmentByDropId({});
      setCurrentBusDelayMinutes(null);
      return;
    }
    setLoadingManifest(true);
    try {
      const [board, drop, over, progressList] = await Promise.all([
        getPassengersOnBoard(user.companyId, selectedTripId),
        agencyStopOrder != null
          ? getPassengersToDrop(user.companyId, selectedTripId, agencyStopOrder)
          : Promise.resolve([]),
        agencyStopOrder != null
          ? detectOvertravelPassengers(user.companyId, selectedTripId, agencyStopOrder)
          : Promise.resolve([]),
        getTripProgress(user.companyId, selectedTripId),
      ]);
      setOnBoard(board);
      setToDrop(drop);
      setOvertravel(over);

      const atThisStop = agencyStopOrder != null ? progressList.find((p) => p.stopOrder === agencyStopOrder) : null;
      setCurrentBusDelayMinutes(atThisStop?.delayMinutes ?? null);

      const nextMap: Record<string, { routeLabel: string; departureTime: string } | null> = {};
      await Promise.all(
        drop
          .filter((r) => r.connectionId && r.tripInstanceId != null && r.destinationStopOrder != null)
          .map(async (r) => {
            const info = await getNextSegmentInfo(
              user.companyId,
              r.connectionId!,
              r.tripInstanceId!,
              r.destinationStopOrder!
            );
            nextMap[r.id] = info ? { routeLabel: info.routeLabel, departureTime: info.departureTime } : null;
          })
      );
      setNextSegmentByDropId(nextMap);
    } catch (e) {
      console.error("[Manifest] load manifest error:", e);
      setOnBoard([]);
      setToDrop([]);
      setOvertravel([]);
      setNextSegmentByDropId({});
      setCurrentBusDelayMinutes(null);
    } finally {
      setLoadingManifest(false);
    }
  }, [user?.companyId, selectedTripId, agencyStopOrder]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  const handleMarkDropped = useCallback(
    async (r: PassengerToDrop) => {
      if (!user?.companyId) return;
      setUpdatingDropoffId(r.id);
      try {
        await markDropped(user.companyId, r.agencyId, r.id);
        setToDrop((prev) => prev.filter((p) => p.id !== r.id));
      } catch (e) {
        console.error("[Manifest] markDropped error:", e);
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
        <PageHeader title="Manifeste bus" icon={ClipboardList} />
        <SectionCard title="Configuration">
          <p className="text-amber-600 dark:text-amber-400">
            Cette agence n&apos;est pas configurée en escale (routeId et stopOrder requis).
          </p>
        </SectionCard>
      </StandardLayoutWrapper>
    );
  }

  const selectedTrip = tripInstances.find((t) => t.id === selectedTripId);

  const renderManifestTable = (
    rows: Array<{ id: string; nomClient: string; depart: string; arrivee: string; boardingStatus?: string; dropoffStatus?: string; journeyStatus?: string; connectionId?: string | null }>
  ) => (
    <div className={table.wrapper}>
      <table className={table.base}>
        <thead className={table.head}>
          <tr>
            <th className={table.th}>Nom passager</th>
            <th className={table.th}>Origine</th>
            <th className={table.th}>Destination</th>
            <th className={table.th}>Statut embarquement</th>
            <th className={table.th}>Statut descente</th>
            <th className={table.th}>Correspondance</th>
          </tr>
        </thead>
        <tbody className={table.body}>
          {rows.map((r) => (
            <tr key={r.id} className={tableRowClassName()}>
              <td className={table.td}>{r.nomClient || "—"}</td>
              <td className={table.td}>{r.depart || "—"}</td>
              <td className={table.td}>{r.arrivee || "—"}</td>
              <td className={table.td}>{r.boardingStatus ?? "—"}</td>
              <td className={table.td}>{r.dropoffStatus ?? "—"}</td>
              <td className={table.td}>
                {r.connectionId ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    <Link2 className="w-3.5 h-3.5" />
                    Passager en correspondance
                  </span>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Manifeste passagers"
        subtitle="Liste des passagers à bord, à descendre et en dépassement"
        icon={ClipboardList}
      />

      <SectionCard title="Choisir le bus" className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="manifest-trip-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Bus :
          </label>
          <select
            id="manifest-trip-select"
            value={selectedTripId ?? ""}
            onChange={(e) => setSelectedTripId(e.target.value || null)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm min-w-[200px]"
          >
            {tripInstances.map((t) => (
              <option key={t.id} value={t.id}>
                {t.routeDeparture} → {t.routeArrival} — {t.departureTime}
              </option>
            ))}
          </select>
        </div>
      </SectionCard>

      {loadingManifest ? (
        <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
          Chargement du manifeste…
        </div>
      ) : (
        <>
          {/* 1. Passagers à bord */}
          <SectionCard
            title={`1. Passagers à bord — ${selectedTrip ? `${selectedTrip.routeDeparture} → ${selectedTrip.routeArrival} ${selectedTrip.departureTime}` : ""}`}
            className="mb-6"
            noPad
          >
            {onBoard.length === 0 ? (
              <EmptyState message="Aucun passager à bord pour ce bus." />
            ) : (
              renderManifestTable(
                onBoard.map((r) => ({
                  id: r.id,
                  nomClient: r.nomClient,
                  depart: r.depart,
                  arrivee: r.arrivee,
                  boardingStatus: r.boardingStatus,
                  dropoffStatus: r.dropoffStatus,
                  connectionId: r.connectionId,
                }))
              )
            )}
          </SectionCard>

          {/* 2. Passagers à descendre ici */}
          <SectionCard
            title="2. Passagers à descendre ici"
            className="mb-6"
            noPad
          >
            {toDrop.length === 0 ? (
              <EmptyState message="Aucun passager à faire descendre à cette escale." />
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
                    {toDrop.map((r) => {
                      const nextSeg = nextSegmentByDropId[r.id];
                      const isConnection = !!r.connectionId;
                      const delayAlert = isConnection && currentBusDelayMinutes != null && currentBusDelayMinutes > 0;
                      return (
                        <tr key={r.id} className={tableRowClassName()}>
                          <td className={table.td}>{r.nomClient || "—"}</td>
                          <td className={table.td}>{r.depart || "—"}</td>
                          <td className={table.td}>{r.arrivee || "—"}</td>
                          <td className={table.td}>
                            {isConnection && (
                              <div className="flex flex-col gap-0.5 text-xs">
                                <span className="inline-flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400">
                                  <Link2 className="w-3.5 h-3.5" />
                                  Passager en correspondance
                                </span>
                                {nextSeg && (
                                  <span className="text-gray-600 dark:text-gray-400">
                                    <Bus className="w-3 h-3 inline mr-0.5" />
                                    Correspondance vers {nextSeg.routeLabel} — {nextSeg.departureTime}
                                  </span>
                                )}
                                {delayAlert && (
                                  <span className="font-medium text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                                    Correspondance potentiellement manquée
                                  </span>
                                )}
                              </div>
                            )}
                            {!isConnection && "—"}
                          </td>
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

          {/* 3. Passagers en dépassement (fraude) */}
          <SectionCard
            title="3. Passagers en dépassement (fraude)"
            className="mb-6"
            noPad
          >
            {overtravel.length === 0 ? (
              <EmptyState message="Aucun passager en dépassement." />
            ) : (
              <>
                <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">⚠ PASSAGER(S) AU-DELÀ DE LEUR DESTINATION</span>
                </div>
                {renderManifestTable(overtravel)}
              </>
            )}
          </SectionCard>
        </>
      )}
    </StandardLayoutWrapper>
  );
}
