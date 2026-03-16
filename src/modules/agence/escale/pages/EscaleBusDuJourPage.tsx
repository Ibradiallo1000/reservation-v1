/**
 * Page Bus du jour : liste des tripInstances du jour pour la route de l'escale.
 * Affiche : origine, destination finale, heure passage escale, places restantes.
 * Actions : Voir passagers (→ boarding/scan), Vendre billet (→ guichet mode escale).
 */
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, EmptyState, table } from "@/ui";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import { listTripInstancesByRouteIdAndDate } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { getRemainingSeats } from "@/modules/compagnie/tripInstances/segmentOccupancyService";
import { getStopQuotaDisplay } from "@/modules/compagnie/tripInstances/inventoryQuotaService";
import type { RouteStopDocWithId } from "@/modules/compagnie/routes/routesTypes";
import type { TripInstanceDocWithId } from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import { Bus, Ticket, Loader2, Users } from "lucide-react";
import { DayFilterBar } from "@/shared/date/DayFilterBar";
import { getSelectedDateStr, toLocalDateStr, type DayPreset } from "@/shared/date/dayFilterUtils";

function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutesToAdd;
  const h2 = Math.floor(total / 60) % 24;
  const m2 = total % 60;
  return `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
}

export default function EscaleBusDuJourPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agencyRouteId, setAgencyRouteId] = useState<string | null>(null);
  const [agencyStopOrder, setAgencyStopOrder] = useState<number | null>(null);
  const [stop, setStop] = useState<RouteStopDocWithId | null>(null);
  const [instances, setInstances] = useState<TripInstanceDocWithId[]>([]);
  const [remainingByInstanceId, setRemainingByInstanceId] = useState<Record<string, number>>({});
  const [quotaDisplayByInstanceId, setQuotaDisplayByInstanceId] = useState<
    Record<string, { remainingSeats: number; remainingStopQuota: number; quotaReleased: boolean; stopQuotaNominal: number; soldFromStop: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayPreset, setDayPreset] = useState<DayPreset>("today");
  const [customDate, setCustomDate] = useState<string>(() => toLocalDateStr(new Date()));

  const selectedDateStr = getSelectedDateStr(dayPreset, customDate);

  const load = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) {
      setLoading(false);
      setError("Session invalide.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const agencyRef = doc(db, "companies", user.companyId, "agences", user.agencyId);
      const agencySnap = await getDoc(agencyRef);
      if (!agencySnap.exists()) {
        setError("Agence introuvable.");
        setLoading(false);
        return;
      }
      const ad = agencySnap.data() as { type?: string; routeId?: string; stopOrder?: number };
      const typ = (ad.type ?? "principale").toLowerCase();
      const routeId = ad.routeId ?? null;
      const stopOrder = ad.stopOrder ?? null;
      setAgencyRouteId(routeId);
      setAgencyStopOrder(stopOrder);

      if (typ !== "escale" || !routeId) {
        setError("Cette agence n'est pas configurée en escale.");
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

      const list = await listTripInstancesByRouteIdAndDate(user.companyId, routeId, selectedDateStr);
      const remainingById: Record<string, number> = {};
      const quotaById: Record<string, { remainingSeats: number; remainingStopQuota: number; quotaReleased: boolean; stopQuotaNominal: number; soldFromStop: number }> = {};
      const so = stopOrder ?? 1;
      await Promise.all(
        list.map(async (ti) => {
          remainingById[ti.id] = await getRemainingSeats(user.companyId, ti.id);
          const display = await getStopQuotaDisplay(user.companyId, ti.id, so);
          quotaById[ti.id] = display;
        })
      );
      setInstances(list);
      setRemainingByInstanceId(remainingById);
      setQuotaDisplayByInstanceId(quotaById);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement.");
      setInstances([]);
      setRemainingByInstanceId({});
      setQuotaDisplayByInstanceId({});
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId, selectedDateStr]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = instances.map((ti) => {
    const capacity = (ti as { seatCapacity?: number; capacitySeats?: number }).seatCapacity ?? (ti as { capacitySeats?: number }).capacitySeats ?? 0;
    const reserved = (ti as { reservedSeats?: number }).reservedSeats ?? 0;
    const remaining = remainingByInstanceId[ti.id] ?? capacity - reserved;
    const departureTime = (ti as { departureTime?: string }).departureTime ?? "";
    const offsetMin = stop?.estimatedArrivalOffsetMinutes ?? 0;
    const timeAtStop = addMinutesToTime(departureTime, offsetMin);
    const origin = (ti as { departureCity?: string; routeDeparture?: string }).departureCity ?? (ti as { routeDeparture?: string }).routeDeparture ?? "";
    const dest = (ti as { arrivalCity?: string; routeArrival?: string }).arrivalCity ?? (ti as { routeArrival?: string }).routeArrival ?? "";
    return {
      id: ti.id,
      origin,
      dest,
      departureTime,
      timeAtStop,
      remaining,
      capacity,
      status: (ti as { status?: string }).status,
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

  const handleVoirPassagers = (tripInstanceId: string, departureTime: string) => {
    navigate("/agence/boarding/scan", {
      state: {
        agencyId: user?.agencyId,
        date: selectedDateStr,
        heure: departureTime,
        tripId: tripInstanceId,
      },
    });
  };

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
        <PageHeader title="Bus du jour" icon={Bus} />
        <SectionCard title="Erreur">
          <p className="text-amber-600 dark:text-amber-400">{error}</p>
        </SectionCard>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <PageHeader
          title="Bus du jour"
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

      <SectionCard title={`Trajets (${selectedDateStr}) — ${instances.length}`} noPad>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState message={`Aucun bus prévu le ${selectedDateStr} pour cette escale.`} />
          </div>
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Bus</th>
                  <th className={table.th}>Heure passage escale</th>
                  <th className={table.th}>Places (global / quota escale)</th>
                  <th className={table.th + " w-48 text-right"}>Actions</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className={table.td}>
                      <span className="font-medium">{r.origin} → {r.dest}</span>
                    </td>
                    <td className={table.td}>{r.timeAtStop}</td>
                    <td className={table.td}>
                      <div className="flex flex-col gap-0.5 text-sm">
                        <span className={r.remaining <= 0 ? "text-red-600" : r.remaining <= 10 ? "text-amber-600" : "text-gray-700 dark:text-gray-300"}>
                          Places restantes : {r.remaining} / {r.capacity}
                        </span>
                        {r.quotaDisplay && (
                          <>
                            <span className="text-gray-600 dark:text-gray-400">
                              Quota escale : {r.quotaDisplay.remainingStopQuota} vendables
                              {r.quotaDisplay.quotaReleased && <span className="ml-1 text-emerald-600">(quota libéré)</span>}
                            </span>
                            {r.quotaDisplay.soldFromStop > 0 && (
                              <span className="text-xs text-gray-500">Passagers qui descendent ici : {r.quotaDisplay.soldFromStop} places déjà vendues depuis cette escale</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className={table.td + " text-right"}>
                      <div className="flex items-center justify-end gap-2">
                        <ActionButton
                          onClick={() => handleVoirPassagers(r.id, r.departureTime)}
                          title="Voir la liste des passagers"
                        >
                          <Users className="w-4 h-4" />
                          Voir passagers
                        </ActionButton>
                        <ActionButton
                          onClick={() => handleVendreBillet(r.id)}
                          disabled={r.remainingAllowed <= 0 || r.status === "cancelled"}
                          title={r.remainingAllowed <= 0 ? "Complet ou quota atteint" : "Vendre un billet"}
                        >
                          <Ticket className="w-4 h-4" />
                          Vendre billet
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
    </StandardLayoutWrapper>
  );
}
